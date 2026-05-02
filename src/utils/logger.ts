import pino from "pino";
import type { AppConfig } from "../config/env.js";

/**
 * Creates the process logger.
 *
 * @param config Application configuration with the desired log level.
 * @returns Pino logger instance.
 */
export function createLogger(config: Pick<AppConfig, "logLevel" | "nodeEnv">) {
  return pino({
    name: "self-helper-bot",
    level: config.logLevel,
    transport: config.nodeEnv === "development" ? { target: "pino-pretty" } : undefined
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
