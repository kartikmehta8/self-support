import type { KnownBlock } from "@slack/types";
import type { Ticket, TicketQuestion } from "../../domain/ticket.js";

interface SlackMessagePayload {
  text: string;
  blocks: KnownBlock[];
}

interface TicketDetail {
  label: string;
  value: string;
}

const DETAIL_FIELDS: Array<{
  key: keyof TicketQuestion;
  label: string;
}> = [
  { key: "problem", label: "Problem" },
  { key: "expectedBehavior", label: "Expected behavior" },
  { key: "environment", label: "Environment" },
  { key: "links", label: "References" }
];

/**
 * Formats the compact Slack parent message for a mirrored ticket.
 *
 * @param ticket Ticket to summarize.
 * @param discordThreadUrl Discord thread URL for admins.
 * @returns Slack message payload.
 */
export function formatTicketSummaryMessage(
  ticket: Ticket,
  discordThreadUrl?: string
): SlackMessagePayload {
  const lines = [
    `*${ticket.id}: ${ticket.question.title}*`,
    `Requester: \`${ticket.requesterTag}\``,
    discordThreadUrl ? `<${discordThreadUrl}|Open Discord thread>` : undefined
  ].filter((line): line is string => Boolean(line));

  return {
    text: lines.map(stripSlackFormatting).join("\n"),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: lines.join("\n")
        }
      }
    ]
  };
}

/**
 * Formats detailed ticket context for the Slack thread.
 *
 * @param ticket Ticket to expand.
 * @returns Slack message payload.
 */
export function formatTicketDetailsMessage(ticket: Ticket): SlackMessagePayload {
  const details = DETAIL_FIELDS.map(({ key, label }) =>
    toTicketDetail(label, ticket.question[key])
  ).filter((detail): detail is TicketDetail => Boolean(detail));

  return {
    text: details.map(({ label, value }) => `${label}\n${value}`).join("\n\n"),
    blocks: details.map(({ label, value }) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${label}*\n${value}`
      }
    }))
  };
}

function toTicketDetail(label: string, value?: string): TicketDetail | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return { label, value: trimmed };
}

function stripSlackFormatting(text: string): string {
  return text
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2: $1");
}
