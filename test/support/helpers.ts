import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "../../src/config/env.js";
import type { Ticket } from "../../src/domain/ticket.js";
import type { AppLogger } from "../../src/utils/logger.js";

type DeepPartial<T> = {
  [Key in keyof T]?: T[Key] extends Array<infer Item>
    ? Item[]
    : T[Key] extends object
      ? DeepPartial<T[Key]>
      : T[Key];
};

export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  const now = "2026-05-02T00:00:00.000Z";

  return {
    id: "SELF-9F09D74C",
    status: "open",
    requesterId: "user-1",
    requesterTag: "kartikmehta",
    discordChannelId: "discord-channel",
    discordThreadId: "discord-thread",
    slackChannelId: "slack-channel",
    slackThreadTs: "111.222",
    question: {
      title: "Title",
      productArea: "Mobile App",
      mobileAppVersion: "1.2.x",
      problem: "problem",
      imageUrl: "https://self.xyz/screenshot.png"
    },
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

export function makeConfig(overrides: DeepPartial<AppConfig> = {}): AppConfig {
  const base: AppConfig = {
    nodeEnv: "test",
    logLevel: "silent",
    port: 0,
    openai: {
      apiKey: undefined,
      model: "openai/gpt-5.4"
    },
    discord: {
      token: "discord-token",
      clientId: "client-id",
      guildId: "guild-id",
      supportChannelId: "support-channel",
      adminRoleIds: []
    },
    slack: {
      botToken: "slack-token",
      signingSecret: undefined,
      supportChannelId: "support-slack-channel"
    },
    persistence: {
      sqlitePath: join(tmpdir(), "self-helper-test.sqlite"),
      mastraSqlitePath: join(tmpdir(), "self-helper-mastra-test.sqlite")
    },
    queue: {
      backend: "memory",
      redisUrl: "redis://127.0.0.1:6379",
      answerConcurrency: 2
    },
    knowledge: {
      selfRepoUrl: "https://github.com/selfxyz/self.git",
      selfDocsRepoUrl: "https://github.com/selfxyz/self-docs.git",
      repoBasePath: join(tmpdir(), "self-helper-repos"),
      refreshCronMs: 60_000,
      maxSearchResults: 8
    }
  };

  return {
    ...base,
    ...overrides,
    openai: { ...base.openai, ...overrides.openai },
    discord: { ...base.discord, ...overrides.discord },
    slack: { ...base.slack, ...overrides.slack },
    persistence: { ...base.persistence, ...overrides.persistence },
    queue: { ...base.queue, ...overrides.queue },
    knowledge: { ...base.knowledge, ...overrides.knowledge }
  };
}

export function makeLogger(): AppLogger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as unknown as AppLogger;
}

export async function waitForQueue(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
