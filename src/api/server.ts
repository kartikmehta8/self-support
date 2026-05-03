import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { AppConfig } from "../config/env.js";
import type { DiscordBot } from "../integrations/discord/discord-bot.js";
import type { SlackNotifier } from "../integrations/slack/slack-notifier.js";
import { verifySlackSignature } from "../integrations/slack/verify.js";
import type { TicketRepository } from "../persistence/ticket-repository.js";
import type { AppLogger } from "../utils/logger.js";
import { parseSlackCommandContext } from "./slack-command-context.js";
import { SlackEventDeduper } from "./slack-event-deduper.js";
import {
  parseSlackAppMentionContext,
  parseSlackEventPayload,
  type SlackUrlVerificationEvent
} from "./slack-event-context.js";

export interface ApiServer {
  /**
   * Stops the HTTP server.
   *
   * @returns Promise that resolves after shutdown.
   */
  stop(): Promise<void>;
}

/**
 * Starts the HTTP API for health checks and Slack slash commands.
 *
 * @param config Application configuration.
 * @param repository Ticket repository.
 * @param discord Discord adapter for posting Slack-sourced answers.
 * @param slack Slack adapter for posting Slack thread confirmations.
 * @param logger Application logger.
 * @returns Running API server handle.
 */
export function startApiServer(
  config: AppConfig,
  repository: TicketRepository,
  discord: DiscordBot,
  slack: SlackNotifier,
  logger: AppLogger
): ApiServer {
  const app = new Hono();
  const slackEventDeduper = new SlackEventDeduper();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/slack/commands", async (c) => {
    const rawBody = await c.req.text();
    if (config.slack.signingSecret) {
      const valid = verifySlackSignature(
        config.slack.signingSecret,
        c.req.header("x-slack-request-timestamp"),
        c.req.header("x-slack-signature"),
        rawBody
      );

      if (!valid) {
        return c.text("Invalid Slack signature", 401);
      }
    }

    const form = new URLSearchParams(rawBody);
    const commandContext = parseSlackCommandContext(form);

    if (commandContext.command === "/self-answer") {
      if (!commandContext.channelId || !commandContext.threadTs) {
        return c.json({
          response_type: "ephemeral",
          text: "Slack does not support /self-answer in thread replies. Mention the bot in the mirrored ticket thread with your final answer instead."
        });
      }

      const ticket = await repository.findBySlackThread(
        commandContext.channelId,
        commandContext.threadTs
      );
      if (!ticket) {
        return c.json({
          response_type: "ephemeral",
          text: "No support ticket is linked to this Slack thread."
        });
      }

      if (!commandContext.text) {
        return c.json({
          response_type: "ephemeral",
          text: "Usage: /self-answer Your final answer for the Discord user"
        });
      }

      const updated = await repository.update(ticket.id, {
        status: "answered",
        humanAnswer: commandContext.text
      });
      await discord.postHumanAnswer(updated, commandContext.text);
      return c.json({
        response_type: "in_channel",
        text: "Posted answer to Discord."
      });
    }

    return c.json({
      response_type: "ephemeral",
      text: "Unknown command."
    });
  });

  app.post("/slack/events", async (c) => {
    const rawBody = await c.req.text();
    if (config.slack.signingSecret) {
      const valid = verifySlackSignature(
        config.slack.signingSecret,
        c.req.header("x-slack-request-timestamp"),
        c.req.header("x-slack-signature"),
        rawBody
      );

      if (!valid) {
        return c.text("Invalid Slack signature", 401);
      }
    }

    const payload = parseSlackEventPayload(rawBody);
    if (payload.type === "url_verification") {
      return c.json({ challenge: (payload as SlackUrlVerificationEvent).challenge });
    }

    const mention = parseSlackAppMentionContext(payload);
    if (!mention) {
      return c.json({ ok: true });
    }

    if (!slackEventDeduper.markFirstSeen(mention.eventKey)) {
      return c.json({ ok: true });
    }

    if (!mention.threadTs) {
      return c.json({ ok: true });
    }

    const ticket = await repository.findBySlackThread(mention.channelId, mention.threadTs);
    if (!ticket) {
      return c.json({ ok: true });
    }

    if (!mention.text) {
      await slack.postThreadUpdate(
        ticket,
        "Mention me with the final answer text to post it back to Discord."
      );
      return c.json({ ok: true });
    }

    const updated = await repository.update(ticket.id, {
      status: "answered",
      humanAnswer: mention.text
    });
    await discord.postHumanAnswer(updated, mention.text);
    await slack.postThreadUpdate(updated, "Posted answer to Discord.");

    return c.json({ ok: true });
  });

  const server = serve(
    {
      fetch: app.fetch,
      port: config.port
    },
    (info) => {
      logger.info({ port: info.port }, "HTTP API server started");
    }
  );

  return {
    async stop() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  };
}
