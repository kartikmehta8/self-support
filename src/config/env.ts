import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
  PORT: z.coerce.number().int().positive().default(4111),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("openai/gpt-5.4"),
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1),
  DISCORD_SUPPORT_CHANNEL_ID: z.string().min(1),
  DISCORD_ADMIN_ROLE_IDS: z.string().default(""),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_SUPPORT_CHANNEL_ID: z.string().optional(),
  SQLITE_PATH: z.string().default("./data/self-helper.sqlite"),
  MASTRA_SQLITE_PATH: z.string().default("./data/mastra.sqlite"),
  QUEUE_BACKEND: z.enum(["memory", "redis"]).default("memory"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  ANSWER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(10),
  SELF_REPO_URL: z.string().url().default("https://github.com/selfxyz/self.git"),
  SELF_DOCS_REPO_URL: z.string().url().default("https://github.com/selfxyz/self-docs.git"),
  REPO_BASE_PATH: z.string().default("./repos"),
  REPO_REFRESH_CRON_MS: z.coerce.number().int().min(60000).default(900000),
  MAX_SEARCH_RESULTS: z.coerce.number().int().min(1).max(20).default(8)
});

export type AppConfig = ReturnType<typeof loadConfig>;

/**
 * Parses and normalizes process environment configuration.
 *
 * @returns Fully typed application configuration.
 */
export function loadConfig() {
  const parsed = envSchema.parse(process.env);

  return {
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL,
    port: parsed.PORT,
    openai: {
      apiKey: parsed.OPENAI_API_KEY,
      model: parsed.OPENAI_MODEL
    },
    discord: {
      token: parsed.DISCORD_TOKEN,
      clientId: parsed.DISCORD_CLIENT_ID,
      guildId: parsed.DISCORD_GUILD_ID,
      supportChannelId: parsed.DISCORD_SUPPORT_CHANNEL_ID,
      adminRoleIds: parsed.DISCORD_ADMIN_ROLE_IDS.split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    },
    slack: {
      botToken: parsed.SLACK_BOT_TOKEN,
      signingSecret: parsed.SLACK_SIGNING_SECRET,
      supportChannelId: parsed.SLACK_SUPPORT_CHANNEL_ID
    },
    persistence: {
      sqlitePath: parsed.SQLITE_PATH,
      mastraSqlitePath: parsed.MASTRA_SQLITE_PATH
    },
    queue: {
      backend: parsed.QUEUE_BACKEND,
      redisUrl: parsed.REDIS_URL,
      answerConcurrency: parsed.ANSWER_CONCURRENCY
    },
    knowledge: {
      selfRepoUrl: parsed.SELF_REPO_URL,
      selfDocsRepoUrl: parsed.SELF_DOCS_REPO_URL,
      repoBasePath: parsed.REPO_BASE_PATH,
      refreshCronMs: parsed.REPO_REFRESH_CRON_MS,
      maxSearchResults: parsed.MAX_SEARCH_RESULTS
    }
  };
}
