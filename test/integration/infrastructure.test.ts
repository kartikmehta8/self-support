import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { loadConfig } from "../../src/config/env.js";
import { startApiServer } from "../../src/api/server.js";
import { SqliteTicketRepository } from "../../src/persistence/sqlite-ticket-repository.js";
import { createSupportQueue } from "../../src/queue/create-support-queue.js";
import { InMemorySupportQueue } from "../../src/queue/in-memory-support-queue.js";
import type { TicketRepository } from "../../src/persistence/ticket-repository.js";
import { makeConfig, makeLogger, makeTicket, waitForQueue } from "../support/helpers.js";

describe("configuration", () => {
  it("loads nested config from environment values", () => {
    const previous = { ...process.env };
    process.env.NODE_ENV = "test";
    process.env.DISCORD_TOKEN = "token";
    process.env.DISCORD_CLIENT_ID = "client";
    process.env.DISCORD_GUILD_ID = "guild";
    process.env.DISCORD_SUPPORT_CHANNEL_ID = "channel";
    process.env.DISCORD_ADMIN_ROLE_IDS = " admin, support ,, ";
    process.env.ANSWER_CONCURRENCY = "3";

    const config = loadConfig();
    process.env = previous;

    assert.equal(config.nodeEnv, "test");
    assert.deepEqual(config.discord.adminRoleIds, ["admin", "support"]);
    assert.equal(config.queue.answerConcurrency, 3);
  });
});

describe("SqliteTicketRepository", () => {
  const dbPath = join(tmpdir(), `self-helper-${Date.now()}.sqlite`);

  after(async () => {
    await rm(dbPath, { force: true });
    await rm(`${dbPath}-shm`, { force: true });
    await rm(`${dbPath}-wal`, { force: true });
  });

  it("creates, finds, and updates tickets", async () => {
    const repository = new SqliteTicketRepository(dbPath);
    const ticket = makeTicket({ discordThreadId: undefined, slackChannelId: undefined });

    await repository.create({ ticket });
    const found = await repository.findById(ticket.id);
    const updated = await repository.update(ticket.id, {
      status: "answered",
      aiAnswer: "answer",
      slackThreadTs: "123.456"
    });

    assert.equal(found?.id, ticket.id);
    assert.equal(found?.discordThreadId, undefined);
    assert.equal(updated.status, "answered");
    assert.equal(updated.aiAnswer, "answer");
    assert.equal(updated.slackThreadTs, "123.456");
    await assert.rejects(() => repository.update("missing", { status: "closed" }), /not found/);
  });
});

describe("queue implementations", () => {
  it("processes in-memory queue jobs with configured concurrency", async () => {
    const processed: string[] = [];
    const queue = new InMemorySupportQueue(2, makeLogger());

    await queue.enqueueAnswer({ ticketId: "before-start" });
    await queue.start(async (job) => {
      processed.push(job.ticketId);
    });
    await queue.enqueueAnswer({ ticketId: "after-start" });
    await waitForQueue();
    await queue.stop();
    await queue.enqueueAnswer({ ticketId: "stopped" });
    await waitForQueue();

    assert.deepEqual(processed, ["before-start", "after-start"]);
  });

  it("logs handler failures and builds the memory queue", async () => {
    const errors: unknown[] = [];
    const queue = new InMemorySupportQueue(1, {
      ...makeLogger(),
      error: (entry: unknown) => errors.push(entry)
    });

    await queue.start(async () => {
      throw new Error("boom");
    });
    await queue.enqueueAnswer({ ticketId: "SELF-1" });
    await waitForQueue();

    assert.equal(errors.length, 1);
    assert.equal(
      createSupportQueue(makeConfig(), makeLogger()) instanceof InMemorySupportQueue,
      true
    );
  });
});

describe("HTTP API server", () => {
  it("handles health checks and Slack answer commands", async () => {
    const repository = makeApiRepository();
    const discordPosts: string[] = [];
    const server = startApiServer(
      makeConfig({ port: 4197, slack: { signingSecret: undefined } }),
      repository,
      {
        postHumanAnswer: async (_ticket: unknown, answer: string) => discordPosts.push(answer)
      } as never,
      makeLogger()
    );

    try {
      const health = await fetch("http://127.0.0.1:4197/health");
      const usage = await postCommand(4197, "command=/self-answer&text=");
      const missing = await postCommand(4197, "command=/self-answer&text=missing+hello");
      const answer = await postCommand(
        4197,
        "command=/self-answer&text=SELF-9F09D74C+ship+it&user_name=kartik"
      );
      const unknown = await postCommand(4197, "command=/other&text=hello");

      assert.deepEqual(await health.json(), { ok: true });
      assert.match(usage.text, /Usage/);
      assert.match(missing.text, /was not found/);
      assert.match(answer.text, /Posted answer/);
      assert.match(discordPosts[0] ?? "", /Posted from Slack by kartik/);
      assert.match(unknown.text, /Unknown command/);
    } finally {
      await server.stop();
    }
  });
});

function makeApiRepository(): TicketRepository {
  const ticket = makeTicket();

  return {
    create: async ({ ticket: created }) => created,
    findById: async (id) => (id === ticket.id ? ticket : undefined),
    update: async (_id, update) => ({ ...ticket, ...update })
  };
}

async function postCommand(port: number, body: string): Promise<{ text: string }> {
  const response = await fetch(`http://127.0.0.1:${port}/slack/commands`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  return (await response.json()) as { text: string };
}
