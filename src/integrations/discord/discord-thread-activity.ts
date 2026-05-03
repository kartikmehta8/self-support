import type { TicketRepository } from "../../persistence/ticket-repository.js";
import type { AppLogger } from "../../utils/logger.js";
import type { SlackNotifier } from "../slack/slack-notifier.js";

export const DISCORD_ACTIVITY_NOTIFY_INTERVAL_MS = 60 * 60 * 1000;

export interface DiscordThreadActivityMessage {
  author?: { bot?: boolean };
  channel?: {
    id: string;
    isThread?: () => boolean;
  } | null;
  url?: string;
  attachments?: { size?: number };
}

/**
 * Mirrors fresh Discord thread activity into the linked Slack thread.
 */
export class DiscordThreadActivityNotifier {
  constructor(
    private readonly repository: TicketRepository,
    private readonly slack: SlackNotifier,
    private readonly logger: AppLogger,
    private readonly now: () => Date = () => new Date()
  ) {}

  /**
   * Sends a throttled Slack notification for user activity inside a Discord ticket thread.
   *
   * @param message Discord message event payload.
   * @returns Promise that resolves after handling the activity.
   */
  async handleMessage(message: DiscordThreadActivityMessage): Promise<void> {
    if (message.author?.bot) {
      return;
    }

    const threadId = getThreadId(message);
    if (!threadId) {
      return;
    }

    const ticket = await this.repository.findByDiscordThread(threadId);
    if (!ticket?.slackChannelId || !ticket.slackThreadTs) {
      return;
    }

    const now = this.now();
    if (!shouldNotify(ticket.lastDiscordActivityNotifiedAt, now)) {
      return;
    }

    const updated = await this.repository.update(ticket.id, {
      lastDiscordActivityNotifiedAt: now.toISOString()
    });
    await this.slack.postThreadUpdate(updated, formatDiscordActivityUpdate(message));
    this.logger.info({ ticketId: ticket.id }, "Mirrored Discord thread activity to Slack");
  }
}

export function shouldNotify(lastNotifiedAt: string | undefined, now: Date): boolean {
  if (!lastNotifiedAt) {
    return true;
  }

  const lastNotifiedTime = Date.parse(lastNotifiedAt);
  if (Number.isNaN(lastNotifiedTime)) {
    return true;
  }

  return now.getTime() - lastNotifiedTime >= DISCORD_ACTIVITY_NOTIFY_INTERVAL_MS;
}

function getThreadId(message: DiscordThreadActivityMessage): string | undefined {
  return message.channel?.isThread?.() ? message.channel.id : undefined;
}

function formatDiscordActivityUpdate(message: DiscordThreadActivityMessage): string {
  const attachmentNote = message.attachments?.size ? " with attachment(s)" : "";
  const link = message.url ? `\n<${message.url}|Open message>` : "";
  return `New Discord activity${attachmentNote}.${link}`;
}
