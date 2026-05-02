import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { KnowledgeBaseService } from "../../services/knowledge-base.js";

/**
 * Creates Mastra tools for searching Self Labs code and docs.
 *
 * @param knowledgeBase Knowledge service used by tool executors.
 * @returns Mastra-compatible tool registry.
 */
export function createKnowledgeTools(knowledgeBase: KnowledgeBaseService) {
  const searchKnowledge = createTool({
    id: "search-self-knowledge",
    description:
      "Focused search over selfxyz/self source code and selfxyz/self-docs. Use only when the prompt snippets are insufficient. Search exact API names, error text, or SDK concepts. Do not use for broad exploration.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Search query. Include exact error text, API names, or conceptual terms when possible."
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(12)
        .optional()
        .describe("Maximum number of search results.")
    }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          repository: z.enum(["self", "self-docs"]),
          path: z.string(),
          startLine: z.number(),
          score: z.number(),
          excerpt: z.string()
        })
      )
    }),
    execute: async ({ query, limit }) => {
      const results = await knowledgeBase.search(query, limit);
      return { results };
    }
  });

  const readSelfFile = createTool({
    id: "read-self-file-excerpt",
    description:
      "Read a small excerpt from a specific file returned by search-self-knowledge or already shown in the prompt. Use only when a precise nearby code snippet is required.",
    inputSchema: z.object({
      repository: z.enum(["self", "self-docs"]),
      path: z.string().describe("Relative file path inside the selected repository."),
      startLine: z.number().int().min(1).optional(),
      lineCount: z.number().int().min(1).max(200).optional()
    }),
    outputSchema: z.object({
      excerpt: z.string()
    }),
    execute: async ({ repository, path, startLine, lineCount }) => {
      const excerpt = await knowledgeBase.getFileExcerpt(repository, path, startLine, lineCount);
      return { excerpt };
    }
  });

  const refreshKnowledge = createTool({
    id: "refresh-self-knowledge",
    description:
      "Refresh the local clones of selfxyz/self and selfxyz/self-docs, then rebuild the search index. Use only when the user asks about very recent changes or stale context.",
    inputSchema: z.object({
      reason: z.string().optional().describe("Why a refresh is needed.")
    }),
    outputSchema: z.object({
      indexedDocuments: z.number()
    }),
    execute: async () => {
      const indexedDocuments = await knowledgeBase.refresh();
      return { indexedDocuments };
    }
  });

  return {
    searchKnowledge,
    readSelfFile,
    refreshKnowledge
  };
}
