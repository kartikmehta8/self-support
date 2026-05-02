import { WebClient } from "@slack/web-api";
import type { AppConfig } from "../../config/env.js";
import type { Ticket } from "../../domain/ticket.js";
import type { AppLogger } from "../../utils/logger.js";
import {
  formatTicketDetailsMessage,
  formatTicketSummaryMessage
} from "./slack-ticket-formatters.js";

export interface SlackMirrorResult {
  channelId: string;
  threadTs: string;
}

/**
 * Posts ticket activity into Slack for internal review.
 */
export class SlackNotifier {
  private readonly client?: WebClient;

  /**
   * Creates the Slack notifier.
   *
   * @param config Application configuration.
   * @param logger Application logger.
   */
  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger
  ) {
    this.client = config.slack.botToken ? new WebClient(config.slack.botToken) : undefined;
  }

  /**
   * Mirrors a Discord ticket into the configured Slack support channel.
   *
   * @param ticket Ticket to mirror.
   * @param discordThreadUrl Discord thread URL for admins.
   * @returns Slack thread metadata, or undefined if Slack is disabled.
   */
  async mirrorTicket(
    ticket: Ticket,
    discordThreadUrl?: string
  ): Promise<SlackMirrorResult | undefined> {
    if (!this.client || !this.config.slack.supportChannelId) {
      this.logger.warn({ ticketId: ticket.id }, "Slack is not configured; skipping mirror");
      return undefined;
    }

    const summary = formatTicketSummaryMessage(ticket, discordThreadUrl);
    const response = await this.client.chat.postMessage({
      channel: this.config.slack.supportChannelId,
      text: summary.text,
      unfurl_links: false,
      unfurl_media: false,
      blocks: summary.blocks
    });

    const threadTs = response.ts;
    if (!threadTs || !response.channel) {
      throw new Error("Slack did not return thread metadata");
    }

    await this.postTicketDetails(response.channel, threadTs, ticket);

    return {
      channelId: response.channel,
      threadTs
    };
  }

  /**
   * Posts the support answer into the internal Slack thread.
   *
   * @param ticket Ticket with Slack thread metadata.
   * @param answer Generated answer.
   * @returns Promise that resolves after posting.
   */
  async postGeneratedAnswer(ticket: Ticket, answer: string): Promise<void> {
    if (!this.client || !ticket.slackChannelId || !ticket.slackThreadTs) {
      return;
    }

    await this.client.chat.postMessage({
      channel: ticket.slackChannelId,
      thread_ts: ticket.slackThreadTs,
      text: `Answer posted for ${ticket.id}\n\n${answer.slice(0, 3500)}`,
      unfurl_links: false,
      unfurl_media: false
    });
  }

  /**
   * Posts a status update into the Slack thread.
   *
   * @param ticket Ticket with Slack thread metadata.
   * @param text Update text.
   * @returns Promise that resolves after posting.
   */
  async postThreadUpdate(ticket: Ticket, text: string): Promise<void> {
    if (!this.client || !ticket.slackChannelId || !ticket.slackThreadTs) {
      return;
    }

    await this.client.chat.postMessage({
      channel: ticket.slackChannelId,
      thread_ts: ticket.slackThreadTs,
      text,
      unfurl_links: false,
      unfurl_media: false
    });
  }

  private async postTicketDetails(
    channelId: string,
    threadTs: string,
    ticket: Ticket
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    const details = formatTicketDetailsMessage(ticket);
    await this.client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: details.text,
      unfurl_links: false,
      unfurl_media: false,
      blocks: details.blocks
    });
  }
}
