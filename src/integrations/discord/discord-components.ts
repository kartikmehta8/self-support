import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction
} from "discord.js";
import type { Ticket } from "../../domain/ticket.js";

export const SUPPORT_MODAL_ID = "support-ticket-modal";

export function supportPanelActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("support:open")
      .setLabel("Open Ticket")
      .setStyle(ButtonStyle.Primary)
  );
}

export function buildSupportModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SUPPORT_MODAL_ID)
    .setTitle("Open a Self support ticket")
    .addComponents(
      textInputRow("title", "Title", TextInputStyle.Short, true, "Unable to verify with Self SDK"),
      textInputRow("problem", "What problem are you facing?", TextInputStyle.Paragraph, true),
      textInputRow("expectedBehavior", "Expected behavior", TextInputStyle.Paragraph, false),
      textInputRow(
        "environment",
        "Environment",
        TextInputStyle.Paragraph,
        false,
        "SDK version, app platform, chain, browser"
      ),
      textInputRow(
        "links",
        "Links or references",
        TextInputStyle.Paragraph,
        false,
        "Repo, transaction, logs, screenshots"
      )
    );
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
    "**Problem**",
    ticket.question.problem,
    ticket.question.expectedBehavior
      ? `\n**Expected behavior**\n${ticket.question.expectedBehavior}`
      : undefined,
    ticket.question.environment ? `\n**Environment**\n${ticket.question.environment}` : undefined,
    ticket.question.links ? `\n**Links**\n${ticket.question.links}` : undefined
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
