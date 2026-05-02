import type { AppConfig } from "../config/env.js";
import type { AppLogger } from "../utils/logger.js";
import { BullMqSupportQueue } from "./bullmq-support-queue.js";
import { InMemorySupportQueue } from "./in-memory-support-queue.js";
import type { SupportQueue } from "./support-queue.js";

export interface SupportQueueFactories {
  createRedisQueue(config: AppConfig, logger: AppLogger): SupportQueue;
  createMemoryQueue(config: AppConfig, logger: AppLogger): SupportQueue;
}

const defaultFactories: SupportQueueFactories = {
  createRedisQueue: (config, logger) =>
    new BullMqSupportQueue(config.queue.redisUrl, config.queue.answerConcurrency, logger),
  createMemoryQueue: (config, logger) =>
    new InMemorySupportQueue(config.queue.answerConcurrency, logger)
};

/**
 * Builds the configured queue implementation.
 *
 * @param config Application configuration.
 * @param logger Application logger.
 * @returns Support queue implementation.
 */
export function createSupportQueue(
  config: AppConfig,
  logger: AppLogger,
  factories = defaultFactories
): SupportQueue {
  if (config.queue.backend === "redis") {
    return factories.createRedisQueue(config, logger);
  }

  return factories.createMemoryQueue(config, logger);
}
