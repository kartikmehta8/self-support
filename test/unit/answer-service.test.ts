import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AnswerService } from "../../src/services/answer-service.js";
import { makeConfig, makeLogger, makeTicket } from "../support/helpers.js";

describe("AnswerService", () => {
  it("builds bounded prompts with configured repository links", async () => {
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
    const service = new AnswerService(
      agent as never,
      knowledgeBase as never,
      makeLogger(),
      makeConfig()
    );

    const answer = await service.answerTicket(makeTicket(), { refreshKnowledge: true });

    assert.equal(answer, "answer");
    assert.match(calls[0] ?? "", /Repository context selected before answering/);
    assert.match(calls[0] ?? "", /Source: self\/src\/sdk\.ts:10/);
    assert.match(
      calls[0] ?? "",
      /Source URL: https:\/\/github\.com\/selfxyz\/self\/blob\/main\/src\/sdk\.ts#L10/
    );
    assert.match(calls[0] ?? "", /Always end with a `Resources` section/);
  });

  it("uses a no-context message when search is empty", async () => {
    let prompt = "";
    const service = new AnswerService(
      { generate: async (value: string) => ((prompt = value), { text: "answer" }) } as never,
      { search: async () => [] } as never,
      makeLogger(),
      makeConfig()
    );

    await service.answerTicket(makeTicket());

    assert.match(prompt, /No matching repository context/);
  });

  it("normalizes configured SSH repository URLs for source links", async () => {
    let prompt = "";
    const service = new AnswerService(
      { generate: async (value: string) => ((prompt = value), { text: "answer" }) } as never,
      {
        search: async () => [
          { repository: "self-docs", path: "guide.md", startLine: 4, score: 1, excerpt: "docs" }
        ]
      } as never,
      makeLogger(),
      makeConfig({ knowledge: { selfDocsRepoUrl: "git@github.com:selfxyz/self-docs.git" } })
    );

    await service.answerTicket(makeTicket());

    assert.match(
      prompt,
      /Source URL: https:\/\/github\.com\/selfxyz\/self-docs\/blob\/main\/guide\.md#L4/
    );
  });
});
