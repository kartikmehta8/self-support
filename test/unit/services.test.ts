import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { AnswerService } from "../../src/services/answer-service.js";
import { KnowledgeBaseService } from "../../src/services/knowledge-base.js";
import { chunkDocument } from "../../src/services/knowledge/chunking.js";
import { looksMinified, shouldIndexFile } from "../../src/services/knowledge/file-filter.js";
import {
  excerptFor,
  scoreChunk,
  selectDiverseChunks
} from "../../src/services/knowledge/search.js";
import {
  escapeRegExp,
  limitText,
  sanitizeLine,
  tokenize
} from "../../src/services/knowledge/text.js";
import { TicketAnswerWorker } from "../../src/services/ticket-answer-worker.js";
import type { IndexedDocument, RepositorySource } from "../../src/services/knowledge/types.js";
import { AppError, toError } from "../../src/utils/errors.js";
import { createTicketId } from "../../src/utils/id.js";
import { makeConfig, makeLogger, makeTicket } from "../support/helpers.js";

describe("knowledge text helpers", () => {
  it("normalizes, tokenizes, truncates, and escapes text", () => {
    assert.deepEqual(tokenize("Self SDK SDK proof/error! a x Self SDK"), [
      "self",
      "sdk",
      "proof/error"
    ]);
    assert.equal(limitText("abcdef", 3), "abc\n[truncated 3 chars]");
    assert.equal(sanitizeLine("a".repeat(900)).endsWith("[truncated 100 chars]"), true);
    assert.equal(escapeRegExp("a+b(c)"), "a\\+b\\(c\\)");
  });
});

describe("knowledge file filtering", () => {
  it("accepts source files and rejects generated or oversized-style files", () => {
    assert.equal(shouldIndexFile("/repo/src/index.ts"), true);
    assert.equal(shouldIndexFile("/repo/package-lock.json"), false);
    assert.equal(shouldIndexFile("/repo/public/assets/index.js"), false);
    assert.equal(shouldIndexFile("/repo/app.min.js"), false);
    assert.equal(looksMinified("bundle.css", "a".repeat(20_001)), true);
    assert.equal(looksMinified("readme.md", "a".repeat(20_001)), false);
  });
});

describe("knowledge chunking and search", () => {
  it("chunks documents with line metadata and ranks useful snippets", () => {
    const document = makeDocument(
      "self-docs",
      "docs/sdk.md",
      Array.from({ length: 140 }, (_, index) => `line ${index} Self SDK`).join("\n")
    );
    const chunks = chunkDocument(document);
    const ranked = chunks.map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, ["self", "sdk"], "Self SDK")
    }));

    assert.equal(chunks.length, 2);
    assert.equal(chunks[0]?.startLine, 1);
    assert.equal((ranked[0]?.score ?? 0) > 0, true);
    assert.equal(selectDiverseChunks([...ranked, ...ranked], 3).length, 2);
    assert.match(excerptFor(chunks[0]?.content ?? "", ["sdk"], 1), /1: line 0 Self SDK/);
  });
});

describe("KnowledgeBaseService", () => {
  it("indexes local repositories, searches, and reads file excerpts", async () => {
    const root = join(tmpdir(), `self-helper-kb-${Date.now()}`);
    await seedRepository(
      root,
      "self",
      "src/sdk.ts",
      "export const verify = 'Self SDK proof';\nsecond"
    );
    await seedRepository(root, "self-docs", "guide.md", "# Guide\nSelf SDK verification docs");
    const service = new KnowledgeBaseService(
      makeConfig({ knowledge: { repoBasePath: root } }),
      makeLogger()
    );
    setKnowledgeSources(service, root);

    const count = await service.refresh();
    const results = await service.search("Self SDK verification", 4);
    const excerpt = await service.getFileExcerpt("self-docs", "guide.md", 2, 5);

    assert.equal(count, 2);
    assert.equal(results.length > 0, true);
    assert.match(excerpt, /2: Self SDK verification docs/);
    await assert.rejects(() => service.getFileExcerpt("self", "missing.ts"), AppError);
    await service.stop();
    await rm(root, { recursive: true, force: true });
  });
});

describe("AnswerService", () => {
  it("builds bounded prompts with repository context and refreshes on demand", async () => {
    const calls: string[] = [];
    const agent = {
      generate: async (prompt: string) => {
        calls.push(prompt);
        return { text: "answer" };
      }
    };
    const knowledgeBase = {
      refresh: async () => 1,
      search: async () => [
        {
          repository: "self",
          path: "src/sdk.ts",
          startLine: 10,
          score: 3,
          excerpt: "10: verify()"
        }
      ]
    };
    const service = new AnswerService(agent as never, knowledgeBase as never, makeLogger());

    const answer = await service.answerTicket(makeTicket(), { refreshKnowledge: true });

    assert.equal(answer, "answer");
    assert.match(calls[0] ?? "", /Repository context selected before answering/);
    assert.match(calls[0] ?? "", /Source: self\/src\/sdk\.ts:10/);
  });

  it("uses a no-context message when search is empty", async () => {
    let prompt = "";
    const service = new AnswerService(
      { generate: async (value: string) => ((prompt = value), { text: "answer" }) } as never,
      { search: async () => [] } as never,
      makeLogger()
    );

    await service.answerTicket(makeTicket());

    assert.match(prompt, /No matching repository context/);
  });
});

describe("TicketAnswerWorker", () => {
  it("posts generated answers on the happy path", async () => {
    const records = makeWorkerRecords();
    const worker = new TicketAnswerWorker(
      records.repository,
      { answerTicket: async () => "generated" } as never,
      records.discord,
      records.slack,
      makeLogger()
    );

    await worker.handle({ ticketId: "SELF-9F09D74C", attemptReason: "admin-refresh" });

    assert.deepEqual(records.statuses, ["answering", "answered"]);
    assert.equal(records.discordAnswers[0], "generated");
    assert.equal(records.slackAnswers[0], "generated");
  });

  it("marks tickets for human review on failures and skips missing tickets", async () => {
    const records = makeWorkerRecords();
    const worker = new TicketAnswerWorker(
      records.repository,
      { answerTicket: async () => Promise.reject(new Error("boom")) } as never,
      records.discord,
      records.slack,
      makeLogger()
    );

    await worker.handle({ ticketId: "missing" });
    await worker.handle({ ticketId: "SELF-9F09D74C" });

    assert.deepEqual(records.statuses, ["answering", "needs_human"]);
    assert.match(records.slackUpdates[0] ?? "", /human review needed/);
  });
});

describe("utility helpers", () => {
  it("creates ticket IDs and normalizes errors", () => {
    assert.match(createTicketId(), /^SELF-[0-9A-F]{8}$/);
    assert.equal(toError(new Error("x")).message, "x");
    assert.equal(toError("x").message, "x");
    assert.equal(new AppError("wrapped", "cause").cause, "cause");
  });
});

function makeDocument(
  repository: IndexedDocument["repository"],
  path: string,
  content: string
): IndexedDocument {
  return { repository, path, content, normalized: content.toLowerCase() };
}

async function seedRepository(root: string, repo: string, path: string, content: string) {
  const repoRoot = join(root, repo);
  const file = join(repoRoot, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

function setKnowledgeSources(service: KnowledgeBaseService, root: string): void {
  const sources: RepositorySource[] = [
    { name: "self", url: "https://example.test/self.git", path: join(root, "self") },
    { name: "self-docs", url: "https://example.test/self-docs.git", path: join(root, "self-docs") }
  ];

  Object.defineProperty(service, "sources", { value: sources });
  Object.defineProperty(service, "syncRepository", { value: async () => undefined });
}

function makeWorkerRecords() {
  const ticket = makeTicket();
  const records = {
    statuses: [] as string[],
    discordAnswers: [] as string[],
    slackAnswers: [] as string[],
    slackUpdates: [] as string[]
  };

  return {
    ...records,
    repository: {
      findById: async (id: string) => (id === ticket.id ? ticket : undefined),
      update: async (_id: string, update: { status?: string; aiAnswer?: string }) => {
        if (update.status) {
          records.statuses.push(update.status);
        }
        return { ...ticket, ...update };
      }
    } as never,
    discord: {
      postThreadMessage: async () => undefined,
      postAnswer: async (_ticket: unknown, answer: string) => records.discordAnswers.push(answer)
    } as never,
    slack: {
      postGeneratedAnswer: async (_ticket: unknown, answer: string) =>
        records.slackAnswers.push(answer),
      postThreadUpdate: async (_ticket: unknown, text: string) => records.slackUpdates.push(text)
    } as never
  };
}
