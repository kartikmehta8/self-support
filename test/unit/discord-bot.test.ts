import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DiscordBot } from "../../src/integrations/discord/discord-bot.js";
import type { Ticket } from "../../src/domain/ticket.js";
import type { TicketRepository } from "../../src/persistence/ticket-repository.js";
import type { SupportQueue } from "../../src/queue/support-queue.js";
import { makeConfig, makeLogger, makeTicket } from "../support/helpers.js";

describe("DiscordBot", () => {
  it("posts Slack-sourced human answers without adding a ticket header", async () => {
    const sent: string[] = [];
    const bot = new DiscordBot(
      makeConfig(),
      makeRepository(),
      makeQueue(),
      { postThreadUpdate: async () => undefined } as never,
      makeLogger()
    );
    const internals = bot as unknown as {
      tickets: { postThreadMessage(ticket: Ticket, content: string): Promise<void> };
    };
    internals.tickets = {
      postThreadMessage: async (_ticket, content) => {
        sent.push(content);
      }
    };

    await bot.postHumanAnswer(makeTicket(), "Hi");
    await bot.stop();

    assert.deepEqual(sent, ["Hi"]);
  });
});

function makeRepository(): TicketRepository {
  const ticket = makeTicket();

  return {
    create: async ({ ticket: created }) => created,
    findById: async (id) => (id === ticket.id ? ticket : undefined),
    findBySlackThread: async (channelId, threadTs) =>
      channelId === ticket.slackChannelId && threadTs === ticket.slackThreadTs ? ticket : undefined,
    findByDiscordThread: async (threadId) =>
      threadId === ticket.discordThreadId ? ticket : undefined,
    update: async (_id, update) => ({ ...ticket, ...update })
  };
}

function makeQueue(): SupportQueue {
  return {
    enqueueAnswer: async () => undefined,
    start: async () => undefined,
    stop: async () => undefined
  };
}
