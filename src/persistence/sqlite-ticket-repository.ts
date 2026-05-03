import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Ticket, TicketUpdate } from "../domain/ticket.js";
import type { CreateTicketInput, TicketRepository } from "./ticket-repository.js";

interface TicketRow {
  id: string;
  status: Ticket["status"];
  requester_id: string;
  requester_tag: string;
  discord_channel_id: string;
  discord_thread_id?: string | null;
  slack_channel_id?: string | null;
  slack_thread_ts?: string | null;
  question_json: string;
  ai_answer?: string | null;
  human_answer?: string | null;
  created_at: string;
  updated_at: string;
  last_discord_activity_notified_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
}

/**
 * SQLite implementation for ticket persistence.
 */
export class SqliteTicketRepository implements TicketRepository {
  private readonly db: Database.Database;

  /**
   * Opens the SQLite database and prepares schema.
   *
   * @param sqlitePath File path for SQLite storage.
   */
  constructor(sqlitePath: string) {
    mkdirSync(dirname(sqlitePath), { recursive: true });
    this.db = new Database(sqlitePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  /**
   * Persists a newly created ticket.
   *
   * @param input Ticket creation payload.
   * @returns The persisted ticket.
   */
  async create(input: CreateTicketInput): Promise<Ticket> {
    const ticket = input.ticket;
    this.db
      .prepare(
        `
      INSERT INTO tickets (
        id, status, requester_id, requester_tag, discord_channel_id, discord_thread_id,
        slack_channel_id, slack_thread_ts, question_json, ai_answer,
        human_answer, created_at, updated_at, last_discord_activity_notified_at,
        resolved_at, closed_at
      )
      VALUES (
        @id, @status, @requesterId, @requesterTag, @discordChannelId, @discordThreadId,
        @slackChannelId, @slackThreadTs, @questionJson, @aiAnswer,
        @humanAnswer, @createdAt, @updatedAt, @lastDiscordActivityNotifiedAt,
        @resolvedAt, @closedAt
      )
    `
      )
      .run({
        ...toDbParams(ticket),
        questionJson: JSON.stringify(ticket.question)
      });

    return ticket;
  }

  /**
   * Finds a ticket by ID.
   *
   * @param id Ticket ID.
   * @returns Ticket or undefined.
   */
  async findById(id: string): Promise<Ticket | undefined> {
    const row = this.db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as
      | TicketRow
      | undefined;
    return row ? this.toTicket(row) : undefined;
  }

  /**
   * Finds a ticket by its mirrored Slack thread.
   *
   * @param channelId Slack channel ID.
   * @param threadTs Slack thread timestamp.
   * @returns Ticket or undefined.
   */
  async findBySlackThread(channelId: string, threadTs: string): Promise<Ticket | undefined> {
    const row = this.db
      .prepare("SELECT * FROM tickets WHERE slack_channel_id = ? AND slack_thread_ts = ?")
      .get(channelId, threadTs) as TicketRow | undefined;

    return row ? this.toTicket(row) : undefined;
  }

  /**
   * Finds a ticket by its Discord thread.
   *
   * @param threadId Discord thread ID.
   * @returns Ticket or undefined.
   */
  async findByDiscordThread(threadId: string): Promise<Ticket | undefined> {
    const row = this.db
      .prepare("SELECT * FROM tickets WHERE discord_thread_id = ?")
      .get(threadId) as TicketRow | undefined;
    return row ? this.toTicket(row) : undefined;
  }

  /**
   * Applies a partial update.
   *
   * @param id Ticket ID.
   * @param update Partial ticket update.
   * @returns Updated ticket.
   */
  async update(id: string, update: TicketUpdate): Promise<Ticket> {
    const current = await this.findById(id);
    if (!current) {
      throw new Error(`Ticket ${id} not found`);
    }

    const next: Ticket = {
      ...current,
      ...update,
      updatedAt: new Date().toISOString()
    };

    this.db
      .prepare(
        `
      UPDATE tickets
      SET status = @status,
          discord_thread_id = @discordThreadId,
          slack_channel_id = @slackChannelId,
          slack_thread_ts = @slackThreadTs,
          ai_answer = @aiAnswer,
          human_answer = @humanAnswer,
          updated_at = @updatedAt,
          last_discord_activity_notified_at = @lastDiscordActivityNotifiedAt,
          resolved_at = @resolvedAt,
          closed_at = @closedAt
      WHERE id = @id
    `
      )
      .run(toDbParams(next));

    return next;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        requester_id TEXT NOT NULL,
        requester_tag TEXT NOT NULL,
        discord_channel_id TEXT NOT NULL,
        discord_thread_id TEXT,
        slack_channel_id TEXT,
        slack_thread_ts TEXT,
        question_json TEXT NOT NULL,
        ai_answer TEXT,
        human_answer TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_discord_activity_notified_at TEXT,
        resolved_at TEXT,
        closed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
      CREATE INDEX IF NOT EXISTS idx_tickets_discord_thread_id ON tickets(discord_thread_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_slack_thread_ts ON tickets(slack_thread_ts);
    `);
    this.ensureColumn("tickets", "last_discord_activity_notified_at", "TEXT");
  }

  private toTicket(row: TicketRow): Ticket {
    return {
      id: row.id,
      status: row.status,
      requesterId: row.requester_id,
      requesterTag: row.requester_tag,
      discordChannelId: row.discord_channel_id,
      discordThreadId: row.discord_thread_id ?? undefined,
      slackChannelId: row.slack_channel_id ?? undefined,
      slackThreadTs: row.slack_thread_ts ?? undefined,
      question: JSON.parse(row.question_json) as Ticket["question"],
      aiAnswer: row.ai_answer ?? undefined,
      humanAnswer: row.human_answer ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastDiscordActivityNotifiedAt: row.last_discord_activity_notified_at ?? undefined,
      resolvedAt: row.resolved_at ?? undefined,
      closedAt: row.closed_at ?? undefined
    };
  }

  private ensureColumn(table: string, column: string, type: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((entry) => entry.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
}

function toDbParams(ticket: Ticket): Record<string, unknown> {
  return {
    id: ticket.id,
    status: ticket.status,
    requesterId: ticket.requesterId,
    requesterTag: ticket.requesterTag,
    discordChannelId: ticket.discordChannelId,
    discordThreadId: ticket.discordThreadId ?? null,
    slackChannelId: ticket.slackChannelId ?? null,
    slackThreadTs: ticket.slackThreadTs ?? null,
    aiAnswer: ticket.aiAnswer ?? null,
    humanAnswer: ticket.humanAnswer ?? null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastDiscordActivityNotifiedAt: ticket.lastDiscordActivityNotifiedAt ?? null,
    resolvedAt: ticket.resolvedAt ?? null,
    closedAt: ticket.closedAt ?? null
  };
}
