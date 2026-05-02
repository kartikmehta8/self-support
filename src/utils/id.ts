import { randomUUID } from "node:crypto";

/**
 * Creates a short, human-readable ticket ID.
 *
 * @returns Ticket identifier with a SELF prefix.
 */
export function createTicketId(): string {
  return `SELF-${randomUUID().slice(0, 8).toUpperCase()}`;
}
