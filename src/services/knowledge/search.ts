import { MAX_EXCERPT_CHARS, MAX_QUERY_CHARS, MAX_RESULTS_PER_FILE } from "./limits.js";
import type { IndexedChunk } from "./types.js";
import { escapeRegExp, limitText, normalize, sanitizeLine } from "./text.js";

export function scoreChunk(chunk: IndexedChunk, terms: string[], query: string): number {
  let score = 0;
  const normalizedPath = chunk.document.path.toLowerCase();
  const normalizedQuery = normalize(query.slice(0, MAX_QUERY_CHARS)).trim();

  if (normalizedQuery.length >= 8 && chunk.normalized.includes(normalizedQuery)) {
    score += 40;
  }

  for (const term of terms) {
    if (normalizedPath.includes(term)) {
      score += 12;
    }

    const matches = chunk.normalized.match(new RegExp(escapeRegExp(term), "g"))?.length ?? 0;
    score += Math.min(matches * termWeight(term), 24);
  }

  if (chunk.document.repository === "self-docs") {
    score *= 1.35;
  }

  return score;
}

export function selectDiverseChunks(
  ranked: Array<{ chunk: IndexedChunk; score: number }>,
  limit: number
): Array<{ chunk: IndexedChunk; score: number }> {
  const selected: Array<{ chunk: IndexedChunk; score: number }> = [];
  const perFile = new Map<string, number>();

  for (const item of ranked) {
    const key = `${item.chunk.document.repository}/${item.chunk.document.path}`;
    const count = perFile.get(key) ?? 0;
    if (count >= MAX_RESULTS_PER_FILE) {
      continue;
    }

    selected.push(item);
    perFile.set(key, count + 1);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

export function excerptFor(content: string, terms: string[], lineOffset: number): string {
  const lines = content.split(/\r?\n/).map(sanitizeLine);
  const matchingIndex = lines.findIndex((line) =>
    terms.some((term) => line.toLowerCase().includes(term))
  );
  const center = matchingIndex >= 0 ? matchingIndex : 0;
  const start = Math.max(0, center - 3);
  const end = Math.min(lines.length, start + 12);

  return limitText(
    lines
      .slice(start, end)
      .map((line, index) => `${lineOffset + start + index}: ${line}`)
      .join("\n"),
    MAX_EXCERPT_CHARS
  );
}

function termWeight(term: string): number {
  if (term.includes("/") || term.includes("_") || term.includes("-")) {
    return 2;
  }

  return term.length >= 6 ? 1.5 : 1;
}
