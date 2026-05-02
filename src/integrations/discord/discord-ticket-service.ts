import {
  ChannelType,
  MessageFlags,
  type Client,
  type TextChannel,
  type ThreadChannel
} from "discord.js";
import type { AppConfig } from "../../config/env.js";
import type { Ticket } from "../../domain/ticket.js";
import { adminActionRow, formatTicketIntro, splitDiscordMessage } from "./discord-components.js";

/**
 * Handles Discord thread creation and ticket thread messaging.
 */
export class DiscordTicketService {
  /**
   * Creates the Discord ticket service.
   *
   * @param client Discord client.
   * @param config Application configuration.
   */
  constructor(
    private readonly client: Client,
    private readonly config: AppConfig
  ) {}

  /**
   * Creates a private ticket thread and adds the requester.
   *
   * @param ticket Ticket metadata.
   * @returns Created private thread.
   */
  async createTicketThread(ticket: Ticket): Promise<ThreadChannel> {
    const channel = await this.fetchSupportChannel();
    const thread = await channel.threads.create({
      name: `${ticket.id} ${ticket.question.title}`.slice(0, 90),
      type: ChannelType.PrivateThread,
      invitable: false,
      autoArchiveDuration: 1440,
      reason: `Support ticket opened by ${ticket.requesterTag}`
    });

    await thread.members.add(ticket.requesterId, "Support ticket requester");
    return thread;
  }

  /**
   * Posts the initial ticket details in the private thread.
   *
   * @param ticket Ticket with thread metadata.
   * @returns Promise that resolves after posting.
   */
  async postTicketIntro(ticket: Ticket): Promise<void> {
    const thread = await this.requireThread(ticket);
    await thread.send({
      content: formatTicketIntro(ticket),
      flags: MessageFlags.SuppressEmbeds,
      components: [adminActionRow(ticket.id)]
    });
  }

  /**
   * Posts a message into a ticket thread.
   *
   * @param ticket Ticket with Discord thread metadata.
   * @param content Message content.
   * @returns Promise that resolves after posting.
   */
  async postThreadMessage(ticket: Ticket, content: string): Promise<void> {
    if (!ticket.discordThreadId) {
      return;
    }

    const thread = await this.fetchThread(ticket.discordThreadId);
    for (const chunk of splitDiscordMessage(content)) {
      await thread.send({ content: chunk, flags: MessageFlags.SuppressEmbeds });
    }
  }

  /**
   * Posts a support answer with admin controls.
   *
   * @param ticket Ticket with Discord thread metadata.
   * @param answer Answer text.
   * @returns Promise that resolves after posting.
   */
  async postAnswer(ticket: Ticket, answer: string): Promise<void> {
    const thread = await this.requireThread(ticket);
    const chunks = splitDiscordMessage(`### Answer for ${ticket.id}\n${answer}`);
    for (const chunk of chunks.slice(0, -1)) {
      await thread.send({ content: chunk, flags: MessageFlags.SuppressEmbeds });
    }

    await thread.send({
      content: chunks.at(-1) ?? answer,
      flags: MessageFlags.SuppressEmbeds,
      components: [adminActionRow(ticket.id)]
    });
  }

  /**
   * Locks and archives a ticket thread.
   *
   * @param threadId Discord thread ID.
   * @returns Promise that resolves after closing.
   */
  async closeThread(threadId: string): Promise<void> {
    const thread = await this.fetchThread(threadId);
    await thread.setLocked(true, "Support ticket closed");
    await thread.setArchived(true, "Support ticket closed");
  }

  /**
   * Unlocks and unarchives a ticket thread.
   *
   * @param threadId Discord thread ID.
   * @returns Promise that resolves after reopening.
   */
  async reopenThread(threadId: string): Promise<void> {
    const thread = await this.fetchThread(threadId);
    await thread.setArchived(false, "Support ticket reopened");
    await thread.setLocked(false, "Support ticket reopened");
  }

  /**
   * Fetches the support channel where tickets are created.
   *
   * @returns Configured text channel.
   */
  async fetchSupportChannel(): Promise<TextChannel> {
    const channel = await this.client.channels.fetch(this.config.discord.supportChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error("DISCORD_SUPPORT_CHANNEL_ID must point to a guild text channel");
    }

    return channel;
  }

  private async requireThread(ticket: Ticket): Promise<ThreadChannel> {
    if (!ticket.discordThreadId) {
      throw new Error(`Ticket ${ticket.id} does not have a Discord thread`);
    }

    return this.fetchThread(ticket.discordThreadId);
  }

  private async fetchThread(threadId: string): Promise<ThreadChannel> {
    const channel = await this.client.channels.fetch(threadId);
    if (!channel || !channel.isThread()) {
      throw new Error(`Discord thread ${threadId} not found`);
    }

    return channel;
  }
}
