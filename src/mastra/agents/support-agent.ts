import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import type { AppConfig } from "../../config/env.js";
import type { KnowledgeBaseService } from "../../services/knowledge-base.js";
import { createKnowledgeTools } from "../tools/knowledge-tools.js";

/**
 * Creates the Self Labs support agent.
 *
 * @param config Application configuration.
 * @param knowledgeBase Searchable repository context.
 * @returns Mastra Agent configured for support answers.
 */
export function createSupportAgent(config: AppConfig, knowledgeBase: KnowledgeBaseService) {
  return new Agent({
    id: "self-support-agent",
    name: "Self Support Agent",
    description: "Answers Self Labs support tickets using Self code and documentation context.",
    model: config.openai.model,
    memory: new Memory({
      options: {
        lastMessages: 20
      }
    }),
    instructions: [
      {
        role: "system",
        content: [
          "You are the Self Labs support engineer for self.xyz.",
          "Answer Discord support tickets with empathy, precision, and concrete next steps.",
          "Use the repository snippets already included in the user prompt first.",
          "Only call search-self-knowledge when those snippets are clearly insufficient for the specific question.",
          "Only call read-self-file-excerpt for a file that appeared in search results or in the provided snippets.",
          "Do not browse broad files, generated assets, bundles, lockfiles, or unrelated components.",
          "Keep retrieval focused: at most 2 searches and at most 2 file excerpts before answering.",
          "Prefer documentation context first, then source code context. Include concise code snippets when they help.",
          "If the repository context is insufficient, say what is missing and mark the answer as needing human review instead of inventing facts.",
          "Do not expose secrets, private keys, or unsafe operational instructions.",
          "Format for Discord Markdown. Keep answers detailed, but scannable."
        ].join("\n")
      }
    ],
    tools: createKnowledgeTools(knowledgeBase),
    defaultOptions: {
      maxSteps: 5,
      toolCallConcurrency: 2,
      modelSettings: {
        temperature: 0.2,
        maxOutputTokens: 3000
      }
    }
  });
}
