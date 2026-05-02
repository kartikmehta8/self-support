import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import type { AppConfig } from "../config/env.js";
import type { KnowledgeBaseService } from "../services/knowledge-base.js";
import { createSupportAgent } from "./agents/support-agent.js";

/**
 * Creates the Mastra runtime for agents and tools.
 *
 * @param config Application configuration.
 * @param knowledgeBase Searchable repository context.
 * @returns Mastra runtime and support agent.
 */
export function createMastraRuntime(config: AppConfig, knowledgeBase: KnowledgeBaseService) {
  const supportAgent = createSupportAgent(config, knowledgeBase);

  const mastra = new Mastra({
    agents: {
      supportAgent
    },
    storage: new LibSQLStore({
      id: "self-helper-mastra-storage",
      url: `file:${config.persistence.mastraSqlitePath}`
    }),
    logger: new PinoLogger({
      name: "Mastra",
      level: config.logLevel
    }),
    environment: config.nodeEnv
  });

  return {
    mastra,
    supportAgent
  };
}
