import type { DiscordBot } from "../integrations/discord/discord-bot.js";
import type { SlackNotifier } from "../integrations/slack/slack-notifier.js";
import type { TicketRepository } from "../persistence/ticket-repository.js";
import type { AnswerTicketJob } from "../queue/support-queue.js";
import type { AppLogger } from "../utils/logger.js";
import type { AnswerService } from "./answer-service.js";

/**
 * Processes queued ticket answer jobs.
 */
export class TicketAnswerWorker {
  /**
   * Creates the worker.
   *
   * @param repository Ticket repository.
   * @param answerService Mastra answer service.
   * @param discord Discord bot adapter.
   * @param slack Slack notifier.
   * @param logger Application logger.
   */
  constructor(
    private readonly repository: TicketRepository,
    private readonly answerService: AnswerService,
    private readonly discord: DiscordBot,
    private readonly slack: SlackNotifier,
    private readonly logger: AppLogger
  ) {}

  /**
   * Handles a queued answer job.
   *
   * @param job Answer job payload.
   * @returns Promise that resolves when both platforms are updated.
   */
  async handle(job: AnswerTicketJob): Promise<void> {
    const ticket = await this.repository.findById(job.ticketId);
    if (!ticket) {
      this.logger.warn({ ticketId: job.ticketId }, "Skipping missing ticket");
      return;
    }

    await this.repository.update(ticket.id, { status: "answering" });
    await this.discord.postThreadMessage(
      ticket,
      "I am checking the Self codebase and docs now. I will post an answer here shortly."
    );

    try {
      const answer = await this.answerService.answerTicket(ticket, {
        refreshKnowledge: job.attemptReason === "admin-refresh"
      });
      const updated = await this.repository.update(ticket.id, {
        status: "answered",
        aiAnswer: answer
      });

      await this.discord.postAnswer(updated, answer);
      await this.slack.postGeneratedAnswer(updated, answer);
    } catch (error) {
      this.logger.error({ error, ticketId: ticket.id }, "Answer generation failed");
      const updated = await this.repository.update(ticket.id, { status: "needs_human" });
      await this.discord.postThreadMessage(
        updated,
        "I could not generate a reliable answer automatically. I have marked this for human review."
      );
      await this.slack.postThreadUpdate(
        updated,
        `Answer generation failed for ${updated.id}; human review needed.`
      );
    }
  }
}
