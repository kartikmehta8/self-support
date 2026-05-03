export type TicketStatus =
  | "open"
  | "answering"
  | "answered"
  | "resolved"
  | "closed"
  | "needs_human";

export interface TicketQuestion {
  title: string;
  problem: string;
  expectedBehavior?: string;
  environment?: string;
  links?: string;
}

export interface Ticket {
  id: string;
  status: TicketStatus;
  requesterId: string;
  requesterTag: string;
  discordChannelId: string;
  discordThreadId?: string;
  slackChannelId?: string;
  slackThreadTs?: string;
  question: TicketQuestion;
  aiAnswer?: string;
  humanAnswer?: string;
  createdAt: string;
  updatedAt: string;
  lastDiscordActivityNotifiedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
}

export interface TicketUpdate {
  status?: TicketStatus;
  discordThreadId?: string;
  slackChannelId?: string;
  slackThreadTs?: string;
  aiAnswer?: string;
  humanAnswer?: string;
  lastDiscordActivityNotifiedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
}
