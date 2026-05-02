import type { AppLogger } from "../utils/logger.js";
import type { AnswerTicketJob, SupportQueue } from "./support-queue.js";

/**
 * Lightweight local queue for development and demos.
 */
export class InMemorySupportQueue implements SupportQueue {
  private readonly jobs: AnswerTicketJob[] = [];
  private running = false;
  private active = 0;
  private handler?: (job: AnswerTicketJob) => Promise<void>;

  /**
   * Creates an in-memory queue.
   *
   * @param concurrency Number of jobs to process in parallel.
   * @param logger Application logger.
   */
  constructor(
    private readonly concurrency: number,
    private readonly logger: AppLogger
  ) {}

  /**
   * Enqueues a ticket for answer generation.
   *
   * @param job Ticket answer job.
   * @returns Promise that resolves when the job is accepted.
   */
  async enqueueAnswer(job: AnswerTicketJob): Promise<void> {
    this.jobs.push(job);
    this.pump();
  }

  /**
   * Starts queue workers.
   *
   * @param handler Worker handler called for each answer job.
   * @returns Promise that resolves when workers are ready.
   */
  async start(handler: (job: AnswerTicketJob) => Promise<void>): Promise<void> {
    this.handler = handler;
    this.running = true;
    this.pump();
  }

  /**
   * Stops queue workers.
   *
   * @returns Promise that resolves after shutdown.
   */
  async stop(): Promise<void> {
    this.running = false;
  }

  private pump(): void {
    while (this.running && this.handler && this.active < this.concurrency && this.jobs.length > 0) {
      const job = this.jobs.shift();
      if (!job) {
        return;
      }

      this.active += 1;
      void this.handler(job)
        .catch((error) => {
          this.logger.error({ error, ticketId: job.ticketId }, "In-memory answer job failed");
        })
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }
}
