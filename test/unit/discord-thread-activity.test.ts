import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Ticket } from "../../src/domain/ticket.js";
import type { TicketRepository } from "../../src/persistence/ticket-repository.js";
import {
  DiscordThreadActivityNotifier,
  shouldNotify,
  type DiscordThreadActivityMessage
} from "../../src/integrations/discord/discord-thread-activity.js";
import { makeLogger, makeTicket } from "../support/helpers.js";

describe("DiscordThreadActivityNotifier", () => {
  it("ignores bot, non-thread, and unlinked messages", async () => {
    const records = makeActivityRecords();
    const notifier = new DiscordThreadActivityNotifier(
      records.repository,
      records.slack,
      makeLogger()
    );

    await notifier.handleMessage(makeMessage({ author: { bot: true } }));
    await notifier.handleMessage(makeMessage({ channel: { id: "discord-thread" } }));
    await notifier.handleMessage(makeMessage({ channel: threadChannel("missing-thread") }));

    assert.equal(records.slackUpdates.length, 0);
    assert.equal(records.updates.length, 0);
  });

  it("posts one Slack activity update for a linked Discord thread", async () => {
    const now = new Date("2026-05-02T03:00:00.000Z");
    const records = makeActivityRecords();
    const notifier = new DiscordThreadActivityNotifier(
      records.repository,
      records.slack,
      makeLogger(),
      () => now
    );

    await notifier.handleMessage(
      makeMessage({ attachments: { size: 2 }, url: "https://discord.com/channels/g/c/m" })
    );

    assert.equal(records.slackUpdates.length, 1);
    assert.match(records.slackUpdates[0] ?? "", /New Discord activity with attachment/);
    assert.match(records.slackUpdates[0] ?? "", /Open message/);
    assert.equal(records.updates[0]?.lastDiscordActivityNotifiedAt, now.toISOString());
  });

  it("throttles repeated Discord activity until one hour has passed", async () => {
    let now = new Date("2026-05-02T03:30:00.000Z");
    const records = makeActivityRecords({
      lastDiscordActivityNotifiedAt: "2026-05-02T03:00:00.000Z"
    });
    const notifier = new DiscordThreadActivityNotifier(
      records.repository,
      records.slack,
      makeLogger(),
      () => now
    );

    await notifier.handleMessage(makeMessage());
    now = new Date("2026-05-02T04:00:00.000Z");
    await notifier.handleMessage(makeMessage());

    assert.equal(records.slackUpdates.length, 1);
    assert.equal(records.updates[0]?.lastDiscordActivityNotifiedAt, now.toISOString());
  });
});

describe("shouldNotify", () => {
  it("allows missing, invalid, and expired notification timestamps", () => {
    const now = new Date("2026-05-02T05:00:00.000Z");

    assert.equal(shouldNotify(undefined, now), true);
    assert.equal(shouldNotify("invalid", now), true);
    assert.equal(shouldNotify("2026-05-02T04:00:00.000Z", now), true);
    assert.equal(shouldNotify("2026-05-02T04:30:00.000Z", now), false);
  });
});

function makeActivityRecords(overrides: Partial<Ticket> = {}): {
  repository: TicketRepository;
  slack: never;
  slackUpdates: string[];
  updates: Array<Partial<Ticket>>;
} {
  const ticket = makeTicket(overrides);
  const store = new Map<string, Ticket>([[ticket.id, ticket]]);
  const updates: Array<Partial<Ticket>> = [];
  const slackUpdates: string[] = [];

  return {
    repository: {
      create: async ({ ticket: created }) => created,
      findById: async (id) => store.get(id),
      findBySlackThread: async () => undefined,
      findByDiscordThread: async (threadId) =>
        [...store.values()].find((entry) => entry.discordThreadId === threadId),
      update: async (id, update) => {
        updates.push(update);
        const next = { ...(store.get(id) ?? makeTicket({ id })), ...update };
        store.set(id, next);
        return next;
      }
    },
    slack: {
      postThreadUpdate: async (_ticket: Ticket, text: string) => {
        slackUpdates.push(text);
      }
    } as never,
    slackUpdates,
    updates
  };
}

function makeMessage(
  overrides: Partial<DiscordThreadActivityMessage> = {}
): DiscordThreadActivityMessage {
  return {
    author: { bot: false },
    channel: threadChannel("discord-thread"),
    url: undefined,
    attachments: { size: 0 },
    ...overrides
  };
}

function threadChannel(id: string): NonNullable<DiscordThreadActivityMessage["channel"]> {
  return {
    id,
    isThread: () => true
  };
}
