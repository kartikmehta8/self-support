import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminActionRow,
  buildSupportModal,
  buildSupportModalId,
  formatTicketIntro,
  mobileAppVersionActionRow,
  optionalField,
  parseSupportModalContext,
  splitDiscordMessage,
  supportProductAreaActionRow,
  supportPanelActionRow,
  SUPPORT_MODAL_ID
} from "../../src/integrations/discord/discord-components.js";
import { isSupportAdmin } from "../../src/integrations/discord/discord-permissions.js";
import { makeConfig, makeTicket } from "../support/helpers.js";

interface ComponentJson {
  components: Array<{ custom_id?: string }>;
}

interface ModalJson {
  custom_id?: string;
  components: Array<{ components: Array<{ custom_id?: string }> }>;
}

describe("Discord components", () => {
  it("builds support panel, dropdowns, and modal components", () => {
    const row = supportPanelActionRow().toJSON() as ComponentJson;
    const productAreaRow = supportProductAreaActionRow().toJSON() as ComponentJson;
    const mobileVersionRow = mobileAppVersionActionRow().toJSON() as ComponentJson;
    const modal = buildSupportModal({ productArea: "Self SDK" }).toJSON() as ModalJson;

    assert.equal(row.components[0]?.custom_id, "support:open");
    assert.equal(productAreaRow.components[0]?.custom_id, "support:product-area");
    assert.equal(mobileVersionRow.components[0]?.custom_id, "support:mobile-version");
    assert.match(modal.custom_id ?? "", new RegExp(`^${SUPPORT_MODAL_ID}:`));
    assert.equal(modal.components.length, 3);
    assert.deepEqual(
      modal.components.map((row) => row.components[0]?.custom_id),
      ["title", "problem", "imageUrl"]
    );
  });

  it("round-trips support modal context through custom IDs", () => {
    const customId = buildSupportModalId({
      productArea: "Mobile App",
      mobileAppVersion: "1.2.x"
    });

    assert.deepEqual(parseSupportModalContext(customId), {
      productArea: "Mobile App",
      mobileAppVersion: "1.2.x"
    });
    assert.equal(parseSupportModalContext("other"), undefined);
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
    const minimalIntro = formatTicketIntro(
      makeTicket({ question: { title: "Minimal", problem: "just problem" } })
    );
    const chunks = splitDiscordMessage(`first\n${"a".repeat(2_000)}`);

    assert.match(intro, /### SELF-9F09D74C: Title/);
    assert.match(intro, /\*\*Type\*\*\nMobile App/);
    assert.match(intro, /\*\*Mobile app version\*\*\n1\.2\.x/);
    assert.match(intro, /\*\*Screenshot \/ image\*\*\nhttps:\/\/self\.xyz\/screenshot\.png/);
    assert.doesNotMatch(minimalIntro, /\*\*Type\*\*/);
    assert.doesNotMatch(minimalIntro, /\*\*Mobile app version\*\*/);
    assert.doesNotMatch(minimalIntro, /\*\*Screenshot \/ image\*\*/);
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
