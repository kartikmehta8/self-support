import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { AnswerService } from "../../src/services/answer-service.js";
import { KnowledgeBaseService } from "../../src/services/knowledge-base.js";
import type { RepositorySource } from "../../src/services/knowledge/types.js";
import { makeConfig, makeLogger, makeTicket } from "../support/helpers.js";

describe("coverage edge paths", () => {
  it("covers knowledge service start, empty searches, and skipped minified files", async () => {
    const root = join(tmpdir(), `self-helper-kb-edge-${Date.now()}`);
    await seedFile(root, "self", "src/app.min.js", "a".repeat(20_001));
    await seedFile(root, "self-docs", "empty.md", "   ");
    const service = new KnowledgeBaseService(
      makeConfig({ knowledge: { repoBasePath: root } }),
      makeLogger()
    );
    setKnowledgeSources(service, root);

    assert.equal(await service.refresh(), 1);
    assert.deepEqual(await service.search(""), []);

    Object.defineProperty(service, "refresh", { value: async () => 0 });
    await service.start();
    await service.stop();
    await rm(root, { recursive: true, force: true });
  });

  it("truncates long prompt fields and omits missing optional ticket details", async () => {
    let prompt = "";
    const service = new AnswerService(
      { generate: async (value: string) => ((prompt = value), { text: "answer" }) } as never,
      { search: async () => [] } as never,
      makeLogger(),
      makeConfig()
    );

    await service.answerTicket(
      makeTicket({
        question: {
          title: "Only required fields",
          problem: "p".repeat(4_100)
        }
      })
    );

    assert.match(prompt, /\[truncated 100 chars\]/);
    assert.equal(prompt.includes("Expected behavior:"), false);
    assert.equal(prompt.includes("Environment:"), false);
  });
});

async function seedFile(root: string, repo: string, path: string, content: string): Promise<void> {
  const file = join(root, repo, path);
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
