import type { AppConfig } from "../../src/config/env.js";
import type { Ticket } from "../../src/domain/ticket.js";
import type { TicketRepository } from "../../src/persistence/ticket-repository.js";
import type { SupportQueue } from "../../src/queue/support-queue.js";
import { makeConfig, makeTicket } from "./helpers.js";

export interface DiscordRecords {
  created: Ticket[];
  enqueued: Array<{ ticketId: string; attemptReason?: string }>;
  slackMirrors: Ticket[];
  statuses: string[];
  closedThreads: number;
  reopenedThreads: number;
  repository: TicketRepository;
  queue: SupportQueue;
  slack: never;
  tickets: never;
}

export function makeDiscordRecords(): DiscordRecords {
  const store = new Map<string, Ticket>([["SELF-9F09D74C", makeTicket()]]);
  const records = {
    created: [] as Ticket[],
    enqueued: [] as Array<{ ticketId: string; attemptReason?: string }>,
    slackMirrors: [] as Ticket[],
    statuses: [] as string[],
    closedThreads: 0,
    reopenedThreads: 0
  };
  const repository: TicketRepository = {
    create: async ({ ticket }) => {
      records.created.push(ticket);
      store.set(ticket.id, ticket);
      return ticket;
    },
    findById: async (id) => store.get(id),
    update: async (id, update) => {
      const next = { ...(store.get(id) ?? makeTicket({ id })), ...update };
      store.set(id, next);
      if (update.status) {
        records.statuses.push(update.status);
      }
      return next;
    }
  };
  const queue: SupportQueue = {
    enqueueAnswer: async (job) => {
      records.enqueued.push(job);
    },
    start: async () => undefined,
    stop: async () => undefined
  };

  const result: DiscordRecords = {
    ...records,
    repository,
    queue,
    slack: {
      mirrorTicket: async (ticket: Ticket) => {
        records.slackMirrors.push(ticket);
        return { channelId: "slack", threadTs: "ts" };
      },
      postThreadUpdate: async () => undefined
    } as never,
    tickets: {
      createTicketThread: async () => ({ id: "thread-created" }),
      postTicketIntro: async () => undefined,
      postThreadMessage: async () => undefined,
      reopenThread: async () => {
        records.reopenedThreads += 1;
      },
      closeThread: async () => {
        records.closedThreads += 1;
      }
    } as never
  };

  Object.defineProperty(result, "closedThreads", { get: () => records.closedThreads });
  Object.defineProperty(result, "reopenedThreads", { get: () => records.reopenedThreads });

  return result;
}

export function makeInteractionHandlerConfig(config?: AppConfig): AppConfig {
  return config ?? makeConfig();
}

export function fakeClient(channels: Record<string, unknown>): never {
  return {
    channels: {
      fetch: async (id: string) => channels[id]
    }
  } as never;
}

export function fakeThread(sent: Array<{ content: string; components?: unknown[] }>): never {
  return {
    isThread: () => true,
    send: async (message: { content: string; components?: unknown[] }) => {
      sent.push(message);
    }
  } as never;
}
