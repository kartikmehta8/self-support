import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppConfig } from "../../src/config/env.js";
import { DiscordInteractionHandler } from "../../src/integrations/discord/discord-interactions.js";
import { SUPPORT_MODAL_ID } from "../../src/integrations/discord/discord-components.js";
import { makeConfig } from "../support/helpers.js";
import { makeDiscordRecords } from "../support/discord-fakes.js";

describe("DiscordInteractionHandler", () => {
  it("opens the support modal and ignores unrelated buttons", async () => {
    const shown: string[] = [];
    const handler = makeHandler();

    await handler.handleButton({
      customId: "support:open",
      showModal: async (modal: { toJSON(): { custom_id?: string } }) => {
        shown.push(modal.toJSON().custom_id ?? "");
      }
    } as never);
    await handler.handleButton({ customId: "other:open" } as never);

    assert.deepEqual(shown, [SUPPORT_MODAL_ID]);
  });

  it("posts the support panel only for admins", async () => {
    const records = makeDiscordRecords();
    const sent: string[] = [];
    const replies: string[] = [];
    const handler = new DiscordInteractionHandler(
      makeConfig({ discord: { adminRoleIds: ["admin"] } }),
      records.repository,
      records.queue,
      records.slack,
      {
        fetchSupportChannel: async () => ({
          send: async ({ content }: { content: string }) => sent.push(content)
        })
      } as never
    );

    await handler.handleCommand(commandInteraction("support-panel", ["member"], replies));
    await handler.handleCommand(commandInteraction("support-panel", ["admin"], replies));
    await handler.handleCommand(commandInteraction("other", ["admin"], replies));

    assert.equal(replies[0], "Only support admins can post the ticket panel.");
    assert.match(sent[0] ?? "", /Need help with Self/);
    assert.match(replies[1] ?? "", /Posted the support panel/);
  });

  it("creates a ticket from the modal and queues an answer", async () => {
    const records = makeDiscordRecords();
    const handler = makeHandler(undefined, records);
    const replies: string[] = [];

    await handler.handleModal({
      customId: SUPPORT_MODAL_ID,
      guildId: "guild",
      user: { id: "user-1", tag: "kartikmehta" },
      fields: {
        getTextInputValue: (id: string) => modalValue(id)
      },
      deferReply: async () => undefined,
      editReply: async (message: string) => replies.push(message)
    } as never);

    assert.equal(records.created.length, 1);
    assert.equal(records.slackMirrors.length, 1);
    assert.deepEqual(records.enqueued, [{ ticketId: records.created[0]?.id }]);
    assert.match(replies[0] ?? "", /Created support ticket SELF-/);
  });

  it("handles admin actions and permission failures", async () => {
    const records = makeDiscordRecords();
    const config = makeConfig({ discord: { adminRoleIds: ["admin"] } });
    const handler = makeHandler(config, records);
    const replies: string[] = [];

    await handler.handleButton(adminInteraction("resolve", ["member"], replies));
    await handler.handleButton(adminInteraction("resolve", ["admin"], replies));
    await handler.handleButton(adminInteraction("reopen", ["admin"], replies));
    await handler.handleButton(adminInteraction("refresh", ["admin"], replies));
    await handler.handleButton(adminInteraction("close", ["admin"], replies));
    await handler.handleButton({
      customId: "support:resolve:missing",
      member: { roles: ["admin"] },
      deferReply: async () => undefined,
      editReply: async (message: string) => replies.push(message)
    } as never);

    assert.equal(replies.includes("Only support admins can use this action."), true);
    assert.equal(records.statuses.includes("resolved"), true);
    assert.equal(records.statuses.includes("open"), true);
    assert.equal(records.statuses.includes("closed"), true);
    assert.deepEqual(records.enqueued.at(-1), {
      ticketId: "SELF-9F09D74C",
      attemptReason: "admin-refresh"
    });
    assert.equal(records.closedThreads, 1);
    assert.equal(records.reopenedThreads, 1);
  });
});

function makeHandler(
  config: AppConfig = makeConfig(),
  records = makeDiscordRecords()
): DiscordInteractionHandler {
  return new DiscordInteractionHandler(
    config,
    records.repository,
    records.queue,
    records.slack,
    records.tickets
  );
}

function modalValue(id: string): string {
  const values: Record<string, string> = {
    title: "Title",
    problem: "problem",
    expectedBehavior: "",
    environment: "",
    links: ""
  };

  return values[id] ?? "";
}

function commandInteraction(commandName: string, roles: string[], replies: string[]): never {
  return {
    commandName,
    member: { roles },
    reply: async ({ content }: { content: string }) => replies.push(content)
  } as never;
}

function adminInteraction(action: string, roles: string[], replies: string[]): never {
  return {
    customId: `support:${action}:SELF-9F09D74C`,
    member: { roles },
    user: { tag: "admin-user" },
    reply: async ({ content }: { content: string }) => replies.push(content),
    deferReply: async () => replies.push("deferred"),
    editReply: async (message: string) => replies.push(message)
  } as never;
}
