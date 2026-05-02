export interface AnswerTicketJob {
  ticketId: string;
  attemptReason?: string;
}

export interface SupportQueue {
  /**
   * Enqueues a ticket for answer generation.
   *
   * @param job Ticket answer job.
   * @returns Promise that resolves when the job is accepted.
   */
  enqueueAnswer(job: AnswerTicketJob): Promise<void>;

  /**
   * Starts queue workers.
   *
   * @param handler Worker handler called for each answer job.
   * @returns Promise that resolves when workers are ready.
   */
  start(handler: (job: AnswerTicketJob) => Promise<void>): Promise<void>;

  /**
   * Stops queue workers and connections.
   *
   * @returns Promise that resolves after shutdown.
   */
  stop(): Promise<void>;
}
