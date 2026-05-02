import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SlackNotifier } from "../../src/integrations/slack/slack-notifier.js";
import {
  formatTicketDetailsMessage,
  formatTicketSummaryMessage
} from "../../src/integrations/slack/slack-ticket-formatters.js";
import { verifySlackSignature } from "../../src/integrations/slack/verify.js";
import { makeConfig, makeLogger, makeTicket } from "../support/helpers.js";

interface PostedMessage {
  channel: string;
  thread_ts?: string;
  text: string;
  blocks?: unknown[];
}

describe("Slack ticket formatting", () => {
  it("keeps parent ticket messages compact", () => {
    const payload = formatTicketSummaryMessage(makeTicket(), "https://discord.test/thread");

    assert.equal(
      payload.text,
      [
        "SELF-9F09D74C: Title",
        "Requester: kartikmehta",
        "Open Discord thread: https://discord.test/thread"
      ].join("\n")
    );
    assert.deepEqual(payload.blocks, [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            "*SELF-9F09D74C: Title*",
            "Requester: `kartikmehta`",
            "<https://discord.test/thread|Open Discord thread>"
          ].join("\n")
        }
      }
    ]);
  });

  it("puts ticket details in thread-ready blocks", () => {
    const payload = formatTicketDetailsMessage(makeTicket());

    assert.match(payload.text, /Problem\nproblem/);
    assert.match(payload.text, /Expected behavior\nexpected/);
    assert.match(payload.text, /Environment\nstaging/);
    assert.match(payload.text, /References\nhttps:\/\/self\.xyz/);
    assert.equal(payload.blocks.length, 4);
  });

  it("omits empty optional details", () => {
    const payload = formatTicketDetailsMessage(
      makeTicket({
        question: {
          title: "Title",
          problem: "problem",
          expectedBehavior: "   ",
          environment: undefined,
          links: ""
        }
      })
    );

    assert.equal(payload.text, "Problem\nproblem");
    assert.equal(payload.blocks.length, 1);
  });
});

describe("Slack signature verification", () => {
  it("accepts fresh valid Slack signatures", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = "command=/self-answer&text=SELF-1 done";
    const signature = signSlackBody("secret", timestamp, rawBody);

    assert.equal(verifySlackSignature("secret", timestamp, signature, rawBody), true);
  });

  it("rejects missing, stale, malformed, and mismatched signatures", () => {
    const now = Math.floor(Date.now() / 1000);
    const timestamp = String(now);
    const signature = signSlackBody("secret", timestamp, "body");

    assert.equal(verifySlackSignature("secret", undefined, signature, "body"), false);
    assert.equal(verifySlackSignature("secret", timestamp, undefined, "body"), false);
    assert.equal(verifySlackSignature("secret", "not-a-time", signature, "body"), false);
    assert.equal(verifySlackSignature("secret", String(now - 301), signature, "body"), false);
    assert.equal(verifySlackSignature("secret", timestamp, signature, "different"), false);
    assert.equal(verifySlackSignature("secret", timestamp, "v0=short", "body"), false);
  });
});

describe("SlackNotifier", () => {
  it("mirrors ticket summary to the channel and details to the thread", async () => {
    const posts: PostedMessage[] = [];
    const notifier = new SlackNotifier(makeConfig(), makeLogger());
    setSlackClient(notifier, {
      chat: {
        postMessage: async (message: PostedMessage) => {
          posts.push(message);
          return { channel: message.channel, ts: posts.length === 1 ? "111.222" : "333.444" };
        }
      }
    });

    const result = await notifier.mirrorTicket(makeTicket(), "https://discord.test/thread");

    assert.deepEqual(result, { channelId: "support-slack-channel", threadTs: "111.222" });
    assert.equal(posts.length, 2);
    assert.equal(posts[0]?.channel, "support-slack-channel");
    assert.equal(posts[0]?.thread_ts, undefined);
    assert.equal(posts[0]?.text.includes("Problem"), false);
    assert.equal(posts[1]?.thread_ts, "111.222");
    assert.match(posts[1]?.text ?? "", /Problem\nproblem/);
  });

  it("skips Slack calls when Slack is not configured", async () => {
    const logger = makeLogger();
    const notifier = new SlackNotifier(
      makeConfig({ slack: { botToken: undefined, supportChannelId: undefined } }),
      logger
    );

    assert.equal(await notifier.mirrorTicket(makeTicket()), undefined);
  });

  it("throws when Slack omits thread metadata", async () => {
    const notifier = new SlackNotifier(makeConfig(), makeLogger());
    setSlackClient(notifier, {
      chat: {
        postMessage: async () => ({})
      }
    });

    await assert.rejects(() => notifier.mirrorTicket(makeTicket()), /Slack did not return/);
  });

  it("posts generated answers and thread updates only with thread metadata", async () => {
    const posts: PostedMessage[] = [];
    const notifier = new SlackNotifier(makeConfig(), makeLogger());
    setSlackClient(notifier, {
      chat: {
        postMessage: async (message: PostedMessage) => {
          posts.push(message);
          return { channel: message.channel, ts: "ts" };
        }
      }
    });

    await notifier.postGeneratedAnswer(makeTicket(), "a".repeat(4_000));
    await notifier.postThreadUpdate(makeTicket(), "status");
    await notifier.postGeneratedAnswer(makeTicket({ slackThreadTs: undefined }), "skip");

    assert.equal(posts.length, 2);
    assert.equal(posts[0]?.thread_ts, "111.222");
    assert.equal(posts[0]?.text.length, "Answer posted for SELF-9F09D74C\n\n".length + 3_500);
    assert.equal(posts[1]?.text, "status");
  });
});

function signSlackBody(secret: string, timestamp: string, rawBody: string): string {
  return `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
}

function setSlackClient(notifier: SlackNotifier, client: unknown): void {
  Object.defineProperty(notifier, "client", {
    value: client
  });
}
