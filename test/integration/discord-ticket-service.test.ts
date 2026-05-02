import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType } from "discord.js";
import { DiscordTicketService } from "../../src/integrations/discord/discord-ticket-service.js";
import { makeConfig, makeTicket } from "../support/helpers.js";
import { fakeClient, fakeThread } from "../support/discord-fakes.js";

describe("DiscordTicketService", () => {
  it("creates private ticket threads and adds the requester", async () => {
    const added: string[] = [];
    const createdOptions: unknown[] = [];
    const service = new DiscordTicketService(
      fakeClient({
        "support-channel": {
          type: ChannelType.GuildText,
          threads: {
            create: async (options: unknown) => {
              createdOptions.push(options);
              return { id: "thread-1", members: { add: async (id: string) => added.push(id) } };
            }
          }
        }
      }),
      makeConfig()
    );

    const thread = await service.createTicketThread(makeTicket());

    assert.equal(thread.id, "thread-1");
    assert.equal(added[0], "user-1");
    assert.match(JSON.stringify(createdOptions[0]), /Support ticket opened/);
  });

  it("posts intro, answer, and thread messages", async () => {
    const sent: Array<{ content: string; components?: unknown[] }> = [];
    const thread = fakeThread(sent);
    const service = new DiscordTicketService(
      fakeClient({ "discord-thread": thread }),
      makeConfig()
    );

    await service.postTicketIntro(makeTicket());
    await service.postThreadMessage(makeTicket(), "hello");
    await service.postAnswer(makeTicket(), "answer");
    await service.postThreadMessage(makeTicket({ discordThreadId: undefined }), "skipped");

    assert.match(sent[0]?.content ?? "", /SELF-9F09D74C/);
    assert.equal(sent[0]?.components?.length, 1);
    assert.equal(sent[1]?.content, "hello");
    assert.match(sent[2]?.content ?? "", /### Answer for SELF-9F09D74C/);
  });

  it("closes, reopens, and validates channels", async () => {
    const calls: string[] = [];
    const thread = {
      isThread: () => true,
      setLocked: async (locked: boolean) => calls.push(`locked:${locked}`),
      setArchived: async (archived: boolean) => calls.push(`archived:${archived}`)
    };
    const service = new DiscordTicketService(
      fakeClient({ "support-channel": { type: ChannelType.GuildVoice }, thread }),
      makeConfig()
    );

    await service.closeThread("thread");
    await service.reopenThread("thread");
    await assert.rejects(() => service.fetchSupportChannel(), /guild text channel/);
    await assert.rejects(
      () => service.postTicketIntro(makeTicket({ discordThreadId: undefined })),
      /does not have/
    );

    assert.deepEqual(calls, ["locked:true", "archived:true", "archived:false", "locked:false"]);
  });

  it("rejects missing thread channels", async () => {
    const service = new DiscordTicketService(
      fakeClient({ missing: { isThread: () => false } }),
      makeConfig()
    );

    await assert.rejects(() => service.closeThread("missing"), /not found/);
  });
});
