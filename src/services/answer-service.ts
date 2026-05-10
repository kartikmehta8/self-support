import type { Agent } from "@mastra/core/agent";
import type { AppConfig } from "../config/env.js";
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
type RepositoryWebUrls = Record<SearchResult["repository"], string>;

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
   * @param config Application configuration.
   */
  private readonly repositoryWebUrls: RepositoryWebUrls;

  constructor(
    private readonly agent: Agent,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly logger: AppLogger,
    config: Pick<AppConfig, "knowledge">
  ) {
    this.repositoryWebUrls = {
      self: toRepositoryWebUrl(config.knowledge.selfRepoUrl),
      "self-docs": toRepositoryWebUrl(config.knowledge.selfDocsRepoUrl)
    };
  }

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
      ticket.question.productArea
        ? `Type: ${limitText(ticket.question.productArea, MAX_TICKET_FIELD_CHARS)}\n`
        : "",
      ticket.question.mobileAppVersion
        ? `Mobile app version:\n${limitText(ticket.question.mobileAppVersion, MAX_TICKET_FIELD_CHARS)}\n`
        : "",
      "Problem:",
      limitText(ticket.question.problem, MAX_TICKET_FIELD_CHARS),
      "",
      ticket.question.imageUrl
        ? `Screenshot or image:\n${limitText(ticket.question.imageUrl, MAX_TICKET_FIELD_CHARS)}\n`
        : "",
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
        "When making implementation claims, cite the relevant absolute Source URL from the repository context or tool result.",
        "If you reference any repository file, use an absolute GitHub URL instead of only `self/path.ts:line` or `self-docs/path.md:line`.",
        "Always end with a `Resources` section when any useful links are available.",
        "In `Resources`, include relevant user-provided URLs plus absolute GitHub URLs for referenced code or docs files.",
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
      ticket.question.productArea,
      ticket.question.mobileAppVersion,
      ticket.question.problem,
      ticket.question.imageUrl,
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

    return limitText(
      results.map((result) => this.formatSearchResult(result)).join("\n\n"),
      MAX_REPOSITORY_CONTEXT_CHARS
    );
  }

  private formatSearchResult(result: SearchResult): string {
    return [
      `Source: ${result.repository}/${result.path}:${result.startLine}`,
      `Source URL: ${this.formatRepositoryUrl(result)}`,
      "```",
      result.excerpt,
      "```"
    ].join("\n");
  }

  private formatRepositoryUrl(result: SearchResult): string {
    return `${this.repositoryWebUrls[result.repository]}/blob/main/${result.path}#L${result.startLine}`;
  }
}

function toRepositoryWebUrl(repoUrl: string): string {
  const sshMatch = repoUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`;
  }

  return repoUrl.replace(/\.git$/, "");
}

function limitText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}
