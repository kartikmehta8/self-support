import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { AppConfig } from "../config/env.js";
import type { DiscordBot } from "../integrations/discord/discord-bot.js";
import { verifySlackSignature } from "../integrations/slack/verify.js";
import type { TicketRepository } from "../persistence/ticket-repository.js";
import type { AppLogger } from "../utils/logger.js";

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
 * @param logger Application logger.
 * @returns Running API server handle.
 */
export function startApiServer(
  config: AppConfig,
  repository: TicketRepository,
  discord: DiscordBot,
  logger: AppLogger
): ApiServer {
  const app = new Hono();

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
    const command = form.get("command");
    const text = form.get("text")?.trim() ?? "";
    const userName = form.get("user_name") ?? "Slack user";

    if (command === "/self-answer") {
      const [ticketId, ...answerParts] = text.split(/\s+/);
      const answer = answerParts.join(" ").trim();
      if (!ticketId || !answer) {
        return c.json({
          response_type: "ephemeral",
          text: "Usage: /self-answer TICKET_ID answer text"
        });
      }

      const ticket = await repository.findById(ticketId);
      if (!ticket) {
        return c.json({ response_type: "ephemeral", text: `Ticket ${ticketId} was not found.` });
      }

      const updated = await repository.update(ticket.id, {
        status: "answered",
        humanAnswer: answer
      });
      await discord.postHumanAnswer(updated, `${answer}\n\n_Posted from Slack by ${userName}._`);
      return c.json({
        response_type: "in_channel",
        text: `Posted answer to Discord for ${ticket.id}.`
      });
    }

    return c.json({
      response_type: "ephemeral",
      text: "Unknown command. Use /self-answer."
    });
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
