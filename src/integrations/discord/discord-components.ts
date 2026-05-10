import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction
} from "discord.js";
import type { Ticket } from "../../domain/ticket.js";

export const SUPPORT_MODAL_ID = "support-ticket-modal";
export const SUPPORT_PRODUCT_AREA_SELECT_ID = "support:product-area";
export const SUPPORT_MOBILE_VERSION_SELECT_ID = "support:mobile-version";

export type ProductAreaValue = "self_sdk" | "mobile_app";
export type MobileAppVersionValue = "latest" | "1_2_x" | "1_1_x" | "not_sure";

export interface SupportModalContext {
  productArea?: string;
  mobileAppVersion?: string;
}

const PRODUCT_AREA_LABELS: Record<ProductAreaValue, string> = {
  self_sdk: "Self SDK",
  mobile_app: "Mobile App"
};

const MOBILE_APP_VERSION_LABELS: Record<MobileAppVersionValue, string> = {
  latest: "Latest",
  "1_2_x": "1.2.x",
  "1_1_x": "1.1.x",
  not_sure: "Not sure"
};

export function supportPanelActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("support:open")
      .setLabel("Open Ticket")
      .setStyle(ButtonStyle.Primary)
  );
}

export function supportProductAreaActionRow(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(SUPPORT_PRODUCT_AREA_SELECT_ID)
      .setPlaceholder("Choose Self SDK or Mobile App")
      .addOptions(
        {
          label: PRODUCT_AREA_LABELS.self_sdk,
          value: "self_sdk",
          description: "SDK, proof generation, integration, or verification code"
        },
        {
          label: PRODUCT_AREA_LABELS.mobile_app,
          value: "mobile_app",
          description: "Self mobile app behavior, install, scan, or account issue"
        }
      )
  );
}

export function mobileAppVersionActionRow(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(SUPPORT_MOBILE_VERSION_SELECT_ID)
      .setPlaceholder("Choose mobile app version")
      .addOptions(
        { label: MOBILE_APP_VERSION_LABELS.latest, value: "latest" },
        { label: MOBILE_APP_VERSION_LABELS["1_2_x"], value: "1_2_x" },
        { label: MOBILE_APP_VERSION_LABELS["1_1_x"], value: "1_1_x" },
        { label: MOBILE_APP_VERSION_LABELS.not_sure, value: "not_sure" }
      )
  );
}

export function productAreaLabel(value: string): string | undefined {
  return PRODUCT_AREA_LABELS[value as ProductAreaValue];
}

export function mobileAppVersionLabel(value: string): string | undefined {
  return MOBILE_APP_VERSION_LABELS[value as MobileAppVersionValue];
}

export function buildSupportModal(context: SupportModalContext = {}): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildSupportModalId(context))
    .setTitle("Open a Self support ticket")
    .addComponents(
      textInputRow("title", "Title", TextInputStyle.Short, true, "Unable to verify with Self SDK"),
      textInputRow(
        "problem",
        "Explain the problem",
        TextInputStyle.Paragraph,
        true,
        "What happened? What did you expect? Add SDK version, platform, or device if useful."
      ),
      textInputRow(
        "imageUrl",
        "Screenshot or image link",
        TextInputStyle.Paragraph,
        false,
        "Paste an image URL, or attach the image in the ticket thread after it opens."
      )
    );
}

export function buildSupportModalId(context: SupportModalContext): string {
  return [
    SUPPORT_MODAL_ID,
    encodeURIComponent(context.productArea ?? ""),
    encodeURIComponent(context.mobileAppVersion ?? "")
  ].join(":");
}

export function parseSupportModalContext(customId: string): SupportModalContext | undefined {
  const [modalId, encodedProductArea = "", encodedMobileAppVersion = ""] = customId.split(":");
  if (modalId !== SUPPORT_MODAL_ID) {
    return undefined;
  }

  return {
    productArea: decodeURIComponent(encodedProductArea) || undefined,
    mobileAppVersion: decodeURIComponent(encodedMobileAppVersion) || undefined
  };
}

export function optionalField(interaction: ModalSubmitInteraction, id: string): string | undefined {
  const value = interaction.fields.getTextInputValue(id)?.trim();
  return value.length > 0 ? value : undefined;
}

export function adminActionRow(ticketId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`support:resolve:${ticketId}`)
      .setLabel("Resolved")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`support:reopen:${ticketId}`)
      .setLabel("Reopen")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`support:refresh:${ticketId}`)
      .setLabel("Refresh Answer")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`support:close:${ticketId}`)
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
  );
}

export function formatTicketIntro(ticket: Ticket): string {
  return [
    `### ${ticket.id}: ${ticket.question.title}`,
    `Opened by <@${ticket.requesterId}>`,
    "",
    ticket.question.productArea ? `**Type**\n${ticket.question.productArea}\n` : undefined,
    ticket.question.mobileAppVersion
      ? `**Mobile app version**\n${ticket.question.mobileAppVersion}\n`
      : undefined,
    "**Problem**",
    ticket.question.problem,
    ticket.question.imageUrl ? `\n**Screenshot / image**\n${ticket.question.imageUrl}` : undefined,
    ticket.question.expectedBehavior
      ? `\n**Expected behavior**\n${ticket.question.expectedBehavior}`
      : undefined,
    ticket.question.environment ? `\n**Environment**\n${ticket.question.environment}` : undefined,
    ticket.question.links ? `\n**Links**\n${ticket.question.links}` : undefined,
    "\nYou can attach screenshots or recordings in this private thread if you did not include an image link."
  ]
    .filter(Boolean)
    .join("\n");
}

export function splitDiscordMessage(content: string): string[] {
  const maxLength = 1900;
  if (content.length <= maxLength) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > 0) {
    const slice = remaining.slice(0, maxLength);
    const breakAt = slice.lastIndexOf("\n") > 500 ? slice.lastIndexOf("\n") : slice.length;
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }

  return chunks;
}

function textInputRow(
  id: string,
  label: string,
  style: TextInputStyle,
  required: boolean,
  placeholder?: string
): ActionRowBuilder<TextInputBuilder> {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setRequired(required)
      .setPlaceholder(placeholder ?? label)
  );
}
