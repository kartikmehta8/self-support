import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createKnowledgeTools } from "../../src/mastra/tools/knowledge-tools.js";

describe("Mastra knowledge tools", () => {
  it("delegates search, file excerpt, and refresh operations to the knowledge base", async () => {
    const calls: string[] = [];
    const tools = createKnowledgeTools({
      search: async (query: string, limit?: number) => {
        calls.push(`search:${query}:${limit}`);
        return [{ repository: "self", path: "sdk.ts", startLine: 1, score: 2, excerpt: "excerpt" }];
      },
      getFileExcerpt: async (
        repository: string,
        path: string,
        startLine?: number,
        lineCount?: number
      ) => {
        calls.push(`read:${repository}:${path}:${startLine}:${lineCount}`);
        return "file excerpt";
      },
      refresh: async () => {
        calls.push("refresh");
        return 7;
      }
    } as never);

    assert.deepEqual(await executeTool(tools.searchKnowledge, { query: "verify", limit: 3 }), {
      results: [{ repository: "self", path: "sdk.ts", startLine: 1, score: 2, excerpt: "excerpt" }]
    });
    assert.deepEqual(
      await executeTool(tools.readSelfFile, {
        repository: "self",
        path: "sdk.ts",
        startLine: 4,
        lineCount: 8
      }),
      { excerpt: "file excerpt" }
    );
    assert.deepEqual(await executeTool(tools.refreshKnowledge, {}), { indexedDocuments: 7 });
    assert.deepEqual(calls, ["search:verify:3", "read:self:sdk.ts:4:8", "refresh"]);
  });
});

async function executeTool(tool: unknown, input: unknown): Promise<unknown> {
  return (tool as { execute(input: unknown): Promise<unknown> }).execute(input);
}
