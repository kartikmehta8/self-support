import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction
} from "discord.js";
import type { AppConfig } from "../../config/env.js";
import type { Ticket, TicketQuestion } from "../../domain/ticket.js";
import type { TicketRepository } from "../../persistence/ticket-repository.js";
import type { SupportQueue } from "../../queue/support-queue.js";
import { createTicketId } from "../../utils/id.js";
import type { SlackNotifier } from "../slack/slack-notifier.js";
import {
  buildSupportModal,
  optionalField,
  SUPPORT_MODAL_ID,
  supportPanelActionRow
} from "./discord-components.js";
import { isSupportAdmin } from "./discord-permissions.js";
import type { DiscordTicketService } from "./discord-ticket-service.js";

/**
 * Handles Discord slash commands, modals, and buttons.
 */
export class DiscordInteractionHandler {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: TicketRepository,
    private readonly queue: SupportQueue,
    private readonly slack: SlackNotifier,
    private readonly tickets: DiscordTicketService
  ) {}

  async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.commandName !== "support-panel") {
      return;
    }

    if (!isSupportAdmin(this.config, interaction.member)) {
      await interaction.reply({
        content: "Only support admins can post the ticket panel.",
        ephemeral: true
      });
      return;
    }

    const channel = await this.tickets.fetchSupportChannel();
    await channel.send({
      content: [
        "Need help with Self? Open a ticket and include the details we need to debug it quickly."
      ].join("\n"),
      flags: MessageFlags.SuppressEmbeds,
      components: [supportPanelActionRow()]
    });
    await interaction.reply({
      content: `Posted the support panel in <#${this.config.discord.supportChannelId}>.`,
      ephemeral: true
    });
  }

  async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    if (interaction.customId !== SUPPORT_MODAL_ID) {
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const ticket = await this.createTicketFromModal(interaction);
    await this.repository.create({ ticket });
    const thread = await this.tickets.createTicketThread(ticket);
    const withThread = await this.repository.update(ticket.id, { discordThreadId: thread.id });
    const discordThreadUrl = `https://discord.com/channels/${interaction.guildId}/${thread.id}`;
    const slackMirror = await this.slack.mirrorTicket(withThread, discordThreadUrl);
    const mirrored = slackMirror
      ? await this.repository.update(ticket.id, {
          slackChannelId: slackMirror.channelId,
          slackThreadTs: slackMirror.threadTs
        })
      : withThread;

    await this.tickets.postTicketIntro(mirrored);
    await this.queue.enqueueAnswer({ ticketId: ticket.id });
    await interaction.editReply(`Created support ticket ${ticket.id}: ${discordThreadUrl}`);
  }

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    const [scope, action, ticketId] = interaction.customId.split(":");
    if (scope !== "support" || !action) {
      return;
    }

    if (action === "open") {
      await interaction.showModal(buildSupportModal());
      return;
    }

    if (!ticketId) {
      return;
    }

    if (!isSupportAdmin(this.config, interaction.member)) {
      await interaction.reply({
        content: "Only support admins can use this action.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    await this.handleAdminAction(interaction, action, ticketId);
  }

  private async handleAdminAction(
    interaction: ButtonInteraction,
    action: string,
    ticketId: string
  ): Promise<void> {
    const ticket = await this.repository.findById(ticketId);
    if (!ticket) {
      await interaction.editReply(`Ticket ${ticketId} was not found.`);
      return;
    }

    if (action === "resolve") {
      const updated = await this.repository.update(ticket.id, {
        status: "resolved",
        resolvedAt: new Date().toISOString()
      });
      await this.tickets.postThreadMessage(
        updated,
        `Marked ${ticket.id} as resolved by ${interaction.user.tag}.`
      );
      await this.slack.postThreadUpdate(
        updated,
        `${ticket.id} was marked resolved by ${interaction.user.tag}.`
      );
      await interaction.editReply(`Resolved ${ticket.id}.`);
    } else if (action === "reopen") {
      const updated = await this.repository.update(ticket.id, {
        status: "open",
        resolvedAt: undefined,
        closedAt: undefined
      });
      if (ticket.discordThreadId) {
        await this.tickets.reopenThread(ticket.discordThreadId);
      }
      await this.tickets.postThreadMessage(
        updated,
        `Reopened ${ticket.id} by ${interaction.user.tag}.`
      );
      await interaction.editReply(`Reopened ${ticket.id}.`);
    } else if (action === "refresh") {
      await this.queue.enqueueAnswer({ ticketId: ticket.id, attemptReason: "admin-refresh" });
      await interaction.editReply(`Queued a refreshed answer for ${ticket.id}.`);
    } else if (action === "close") {
      const updated = await this.repository.update(ticket.id, {
        status: "closed",
        closedAt: new Date().toISOString()
      });
      await this.tickets.postThreadMessage(
        updated,
        `Closed ${ticket.id} by ${interaction.user.tag}.`
      );
      if (ticket.discordThreadId) {
        await this.tickets.closeThread(ticket.discordThreadId);
      }
      await interaction.editReply(`Closed ${ticket.id}.`);
    }
  }

  private async createTicketFromModal(interaction: ModalSubmitInteraction): Promise<Ticket> {
    const question: TicketQuestion = {
      title: interaction.fields.getTextInputValue("title"),
      problem: interaction.fields.getTextInputValue("problem"),
      expectedBehavior: optionalField(interaction, "expectedBehavior"),
      environment: optionalField(interaction, "environment"),
      links: optionalField(interaction, "links")
    };

    const now = new Date().toISOString();
    return {
      id: createTicketId(),
      status: "open",
      requesterId: interaction.user.id,
      requesterTag: interaction.user.tag,
      discordChannelId: this.config.discord.supportChannelId,
      question,
      createdAt: now,
      updatedAt: now
    };
  }
}
