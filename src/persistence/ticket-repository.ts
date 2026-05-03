import type { Ticket, TicketUpdate } from "../domain/ticket.js";

export interface CreateTicketInput {
  ticket: Ticket;
}

export interface TicketRepository {
  /**
   * Persists a newly created ticket.
   *
   * @param input Ticket creation payload.
   * @returns The persisted ticket.
   */
  create(input: CreateTicketInput): Promise<Ticket>;

  /**
   * Finds a ticket by ID.
   *
   * @param id Ticket ID.
   * @returns Ticket or undefined.
   */
  findById(id: string): Promise<Ticket | undefined>;

  /**
   * Finds a ticket by its mirrored Slack thread.
   *
   * @param channelId Slack channel ID.
   * @param threadTs Slack thread timestamp.
   * @returns Ticket or undefined.
   */
  findBySlackThread(channelId: string, threadTs: string): Promise<Ticket | undefined>;

  /**
   * Finds a ticket by its Discord thread.
   *
   * @param threadId Discord thread ID.
   * @returns Ticket or undefined.
   */
  findByDiscordThread(threadId: string): Promise<Ticket | undefined>;

  /**
   * Applies a partial update.
   *
   * @param id Ticket ID.
   * @param update Partial ticket update.
   * @returns Updated ticket.
   */
  update(id: string, update: TicketUpdate): Promise<Ticket>;
}
