import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { AppLogger } from "../utils/logger.js";
import type { AnswerTicketJob, SupportQueue } from "./support-queue.js";

interface RedisConnection {
  quit(): Promise<unknown>;
}

interface QueueClient {
  add(
    name: string,
    job: AnswerTicketJob,
    options: {
      attempts: number;
      backoff: { type: string; delay: number };
      removeOnComplete: number;
      removeOnFail: number;
    }
  ): Promise<unknown>;
  close(): Promise<unknown>;
}

interface WorkerClient {
  on(
    event: "failed",
    handler: (job: { id?: string; data: AnswerTicketJob } | undefined, error: Error) => void
  ): void;
  close(): Promise<unknown>;
}

export interface BullMqSupportQueueDependencies {
  createConnection(redisUrl: string): RedisConnection;
  createQueue(connection: RedisConnection): QueueClient;
  createWorker(
    connection: RedisConnection,
    concurrency: number,
    handler: (job: AnswerTicketJob) => Promise<void>
  ): WorkerClient;
}

const defaultDependencies: BullMqSupportQueueDependencies = {
  createConnection: (redisUrl) => new Redis(redisUrl, { maxRetriesPerRequest: null }),
  createQueue: (connection) =>
    new Queue<AnswerTicketJob>("support-answer", { connection: connection as Redis }),
  createWorker: (connection, concurrency, handler) =>
    new Worker<AnswerTicketJob>("support-answer", async (job) => handler(job.data), {
      connection: connection as Redis,
      concurrency
    })
};

/**
 * Redis-backed queue for production traffic.
 */
export class BullMqSupportQueue implements SupportQueue {
  private readonly connection: RedisConnection;
  private readonly queue: QueueClient;
  private worker?: WorkerClient;

  /**
   * Creates the BullMQ queue wrapper.
   *
   * @param redisUrl Redis connection URL.
   * @param concurrency Number of answer jobs to process concurrently.
   * @param logger Application logger.
   */
  constructor(
    redisUrl: string,
    private readonly concurrency: number,
    private readonly logger: AppLogger,
    private readonly dependencies = defaultDependencies
  ) {
    this.connection = this.dependencies.createConnection(redisUrl);
    this.queue = this.dependencies.createQueue(this.connection);
  }

  /**
   * Enqueues a ticket for answer generation.
   *
   * @param job Ticket answer job.
   * @returns Promise that resolves when the job is accepted.
   */
  async enqueueAnswer(job: AnswerTicketJob): Promise<void> {
    await this.queue.add("answer-ticket", job, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 250,
      removeOnFail: 500
    });
  }

  /**
   * Starts queue workers.
   *
   * @param handler Worker handler called for each answer job.
   * @returns Promise that resolves when workers are ready.
   */
  async start(handler: (job: AnswerTicketJob) => Promise<void>): Promise<void> {
    this.worker = this.dependencies.createWorker(this.connection, this.concurrency, handler);

    this.worker.on("failed", (job, error) => {
      this.logger.error(
        { error, jobId: job?.id, ticketId: job?.data.ticketId },
        "BullMQ answer job failed"
      );
    });
  }

  /**
   * Stops queue workers and connections.
   *
   * @returns Promise that resolves after shutdown.
   */
  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
