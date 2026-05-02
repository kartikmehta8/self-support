import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminActionRow,
  buildSupportModal,
  formatTicketIntro,
  optionalField,
  splitDiscordMessage,
  supportPanelActionRow,
  SUPPORT_MODAL_ID
} from "../../src/integrations/discord/discord-components.js";
import { isSupportAdmin } from "../../src/integrations/discord/discord-permissions.js";
import { makeConfig, makeTicket } from "../support/helpers.js";

interface ComponentJson {
  components: Array<{ custom_id?: string }>;
}

describe("Discord components", () => {
  it("builds support panel and modal components", () => {
    const row = supportPanelActionRow().toJSON() as ComponentJson;
    const modal = buildSupportModal().toJSON();

    assert.equal(row.components[0]?.custom_id, "support:open");
    assert.equal(modal.custom_id, SUPPORT_MODAL_ID);
    assert.equal(modal.components.length, 5);
  });

  it("formats optional modal fields", () => {
    const interaction = {
      fields: {
        getTextInputValue: (id: string) => (id === "present" ? " value " : "   ")
      }
    };

    assert.equal(optionalField(interaction as never, "present"), "value");
    assert.equal(optionalField(interaction as never, "missing"), undefined);
  });

  it("formats ticket intros and splits long Discord messages", () => {
    const intro = formatTicketIntro(makeTicket());
    const chunks = splitDiscordMessage(`first\n${"a".repeat(2_000)}`);

    assert.match(intro, /### SELF-9F09D74C: Title/);
    assert.match(intro, /\*\*Environment\*\*\nstaging/);
    assert.equal(splitDiscordMessage("short")[0], "short");
    assert.equal(chunks.length, 2);
    assert.equal(
      chunks.every((chunk) => chunk.length <= 1_900),
      true
    );
  });

  it("builds admin action buttons", () => {
    const row = adminActionRow("SELF-1").toJSON() as ComponentJson;

    assert.deepEqual(
      row.components.map((component) => component.custom_id),
      [
        "support:resolve:SELF-1",
        "support:reopen:SELF-1",
        "support:refresh:SELF-1",
        "support:close:SELF-1"
      ]
    );
  });
});

describe("Discord permissions", () => {
  it("allows everyone when no admin roles are configured", () => {
    assert.equal(isSupportAdmin(makeConfig(), undefined), true);
  });

  it("checks array and cached Discord role shapes", () => {
    const config = makeConfig({ discord: { adminRoleIds: ["admin"] } });

    assert.equal(isSupportAdmin(config, undefined), false);
    assert.equal(isSupportAdmin(config, { roles: ["member", "admin"] }), true);
    assert.equal(isSupportAdmin(config, { roles: ["member"] }), false);
    assert.equal(
      isSupportAdmin(config, { roles: { cache: { has: (role: string) => role === "admin" } } }),
      true
    );
    assert.equal(isSupportAdmin(config, { roles: { cache: { has: () => false } } }), false);
  });
});
