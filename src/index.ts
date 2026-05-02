import { startApiServer } from "./api/server.js";
import { loadConfig } from "./config/env.js";
import { DiscordBot } from "./integrations/discord/discord-bot.js";
import { SlackNotifier } from "./integrations/slack/slack-notifier.js";
import { createMastraRuntime } from "./mastra/index.js";
import { SqliteTicketRepository } from "./persistence/sqlite-ticket-repository.js";
import { createSupportQueue } from "./queue/create-support-queue.js";
import { AnswerService } from "./services/answer-service.js";
import { KnowledgeBaseService } from "./services/knowledge-base.js";
import { TicketAnswerWorker } from "./services/ticket-answer-worker.js";
import { toError } from "./utils/errors.js";
import { createLogger } from "./utils/logger.js";

const config = loadConfig();
const logger = createLogger(config);

const repository = new SqliteTicketRepository(config.persistence.sqlitePath);
const queue = createSupportQueue(config, logger);
const slack = new SlackNotifier(config, logger);
const knowledgeBase = new KnowledgeBaseService(config, logger);
const { supportAgent } = createMastraRuntime(config, knowledgeBase);
const answerService = new AnswerService(supportAgent, knowledgeBase, logger);
const discord = new DiscordBot(config, repository, queue, slack, logger);
const worker = new TicketAnswerWorker(repository, answerService, discord, slack, logger);

let apiServer: ReturnType<typeof startApiServer> | undefined;

async function main(): Promise<void> {
  await knowledgeBase.start();
  await queue.start((job) => worker.handle(job));
  await discord.start();
  apiServer = startApiServer(config, repository, discord, logger);
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down");
  await Promise.allSettled([apiServer?.stop(), discord.stop(), queue.stop(), knowledgeBase.stop()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((error) => {
  const normalized = toError(error);
  logger.error({ error: normalized }, "Fatal startup failure");
  process.exit(1);
});
