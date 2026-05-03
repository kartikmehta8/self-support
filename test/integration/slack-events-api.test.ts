import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startApiServer } from "../../src/api/server.js";
import type { TicketRepository } from "../../src/persistence/ticket-repository.js";
import { makeConfig, makeLogger, makeTicket } from "../support/helpers.js";

describe("Slack Events API", () => {
  it("answers URL verification challenges", async () => {
    const server = startApiServer(
      makeConfig({ port: 4198, slack: { signingSecret: undefined } }),
      makeRepository(),
      { postHumanAnswer: async () => undefined } as never,
      { postThreadUpdate: async () => undefined } as never,
      makeLogger()
    );

    try {
      const response = await postEvent(4198, { type: "url_verification", challenge: "abc123" });

      assert.deepEqual(response, { challenge: "abc123" });
    } finally {
      await server.stop();
    }
  });

  it("posts app mention answers from linked Slack threads to Discord", async () => {
    const discordPosts: string[] = [];
    const slackUpdates: string[] = [];
    const server = startApiServer(
      makeConfig({ port: 4199, slack: { signingSecret: undefined } }),
      makeRepository(),
      {
        postHumanAnswer: async (_ticket: unknown, answer: string) => discordPosts.push(answer)
      } as never,
      {
        postThreadUpdate: async (_ticket: unknown, text: string) => slackUpdates.push(text)
      } as never,
      makeLogger()
    );

    try {
      const response = await postEvent(4199, {
        type: "event_callback",
        event_id: "Ev-answer",
        event: {
          type: "app_mention",
          channel: "slack-channel",
          thread_ts: "111.222",
          user: "U123",
          text: "<@BOT> answer: Ship this fix"
        }
      });

      assert.deepEqual(response, { ok: true });
      assert.equal(discordPosts[0], "Ship this fix");
      assert.equal(slackUpdates[0], "Posted answer to Discord.");
    } finally {
      await server.stop();
    }
  });

  it("ignores duplicate Slack app mention event retries", async () => {
    const discordPosts: string[] = [];
    const slackUpdates: string[] = [];
    const server = startApiServer(
      makeConfig({ port: 4201, slack: { signingSecret: undefined } }),
      makeRepository(),
      {
        postHumanAnswer: async (_ticket: unknown, answer: string) => discordPosts.push(answer)
      } as never,
      {
        postThreadUpdate: async (_ticket: unknown, text: string) => slackUpdates.push(text)
      } as never,
      makeLogger()
    );
    const payload = {
      type: "event_callback",
      event_id: "Ev-duplicate",
      event: {
        type: "app_mention",
        channel: "slack-channel",
        thread_ts: "111.222",
        text: "<@BOT> Ship once"
      }
    };

    try {
      await postEvent(4201, payload);
      await postEvent(4201, payload);

      assert.deepEqual(discordPosts, ["Ship once"]);
      assert.deepEqual(slackUpdates, ["Posted answer to Discord."]);
    } finally {
      await server.stop();
    }
  });

  it("ignores unlinked mentions and prompts for missing answer text", async () => {
    const slackUpdates: string[] = [];
    const server = startApiServer(
      makeConfig({ port: 4200, slack: { signingSecret: undefined } }),
      makeRepository(),
      { postHumanAnswer: async () => undefined } as never,
      {
        postThreadUpdate: async (_ticket: unknown, text: string) => slackUpdates.push(text)
      } as never,
      makeLogger()
    );

    try {
      await postEvent(4200, {
        type: "event_callback",
        event: {
          type: "app_mention",
          channel: "slack-channel",
          thread_ts: "missing",
          text: "<@BOT> hi"
        }
      });
      await postEvent(4200, {
        type: "event_callback",
        event: {
          type: "app_mention",
          channel: "slack-channel",
          thread_ts: "111.222",
          text: "<@BOT>"
        }
      });
      await postEvent(4200, {
        type: "event_callback",
        event: { type: "reaction_added", channel: "slack-channel" }
      });

      assert.equal(slackUpdates.length, 1);
      assert.match(slackUpdates[0] ?? "", /final answer text/);
    } finally {
      await server.stop();
    }
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

async function postEvent(port: number, payload: unknown): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:${port}/slack/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  return response.json();
}
