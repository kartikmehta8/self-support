import type { Agent } from "@mastra/core/agent";
import type { Ticket } from "../domain/ticket.js";
import type { KnowledgeBaseService, SearchResult } from "./knowledge-base.js";
import type { AppLogger } from "../utils/logger.js";

export interface AnswerTicketOptions {
  refreshKnowledge?: boolean;
}

const MAX_TICKET_FIELD_CHARS = 4_000;
const MAX_SEARCH_QUERY_CHARS = 6_000;
const MAX_REPOSITORY_CONTEXT_CHARS = 16_000;
const MAX_PROMPT_CHARS = 28_000;

/**
 * Generates support answers with the Mastra support agent.
 */
export class AnswerService {
  /**
   * Creates the answer service.
   *
   * @param agent Mastra support agent.
   * @param knowledgeBase Searchable repository context.
   * @param logger Application logger.
   */
  constructor(
    private readonly agent: Agent,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly logger: AppLogger
  ) {}

  /**
   * Generates an answer for a ticket.
   *
   * @param ticket Ticket to answer.
   * @param options Answer generation options.
   * @returns Discord-ready Markdown answer.
   */
  async answerTicket(ticket: Ticket, options: AnswerTicketOptions = {}): Promise<string> {
    if (options.refreshKnowledge) {
      await this.knowledgeBase.refresh();
    }

    const repositoryContext = await this.getRepositoryContext(ticket);
    const prompt = [
      `Ticket ID: ${ticket.id}`,
      `Title: ${ticket.question.title}`,
      `Requester: ${ticket.requesterTag}`,
      "",
      "Problem:",
      limitText(ticket.question.problem, MAX_TICKET_FIELD_CHARS),
      "",
      ticket.question.expectedBehavior
        ? `Expected behavior:\n${limitText(ticket.question.expectedBehavior, MAX_TICKET_FIELD_CHARS)}\n`
        : "",
      ticket.question.environment
        ? `Environment:\n${limitText(ticket.question.environment, MAX_TICKET_FIELD_CHARS)}\n`
        : "",
      ticket.question.links
        ? `Links or references:\n${limitText(ticket.question.links, MAX_TICKET_FIELD_CHARS)}\n`
        : "",
      "Repository context selected before answering:",
      repositoryContext,
      "",
      [
        "Write a helpful support answer grounded only in the provided repository context and any additional tool results you fetch.",
        "Do not explore the repo broadly.",
        "Use additional tools only if the selected snippets are not enough to answer this exact ticket.",
        "If using tools, perform at most 2 focused searches and read at most 2 small file excerpts.",
        "Cite relevant snippets as `self-docs/path.md:line` or `self/path.ts:line` when making implementation claims.",
        "If the context does not prove the answer, say what is missing and ask a core dev to review instead of guessing.",
        "Include likely causes, diagnostic steps, and code snippets where useful."
      ].join(" ")
    ]
      .filter(Boolean)
      .join("\n");

    const safePrompt = limitText(prompt, MAX_PROMPT_CHARS);

    this.logger.info(
      { ticketId: ticket.id, promptChars: safePrompt.length },
      "Generating Mastra support answer"
    );

    const response = await this.agent.generate(safePrompt);

    return response.text;
  }

  private async getRepositoryContext(ticket: Ticket): Promise<string> {
    const query = [
      ticket.question.title,
      ticket.question.problem,
      ticket.question.expectedBehavior,
      ticket.question.environment,
      ticket.question.links
    ]
      .filter(Boolean)
      .join("\n");

    const results = await this.knowledgeBase.search(limitText(query, MAX_SEARCH_QUERY_CHARS), 6);
    if (results.length === 0) {
      return "No matching repository context was found in the current local index.";
    }

    return limitText(results.map(formatSearchResult).join("\n\n"), MAX_REPOSITORY_CONTEXT_CHARS);
  }
}

function formatSearchResult(result: SearchResult): string {
  return [
    `Source: ${result.repository}/${result.path}:${result.startLine}`,
    "```",
    result.excerpt,
    "```"
  ].join("\n");
}

function limitText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}
