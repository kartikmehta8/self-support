import { MAX_CHUNK_CHARS } from "./limits.js";
import type { IndexedChunk, IndexedDocument } from "./types.js";
import { limitText, normalize, sanitizeLine } from "./text.js";

export function chunkDocument(document: IndexedDocument): IndexedChunk[] {
  const lines = document.content.split(/\r?\n/).map(sanitizeLine);
  const chunkSize = document.repository === "self-docs" ? 120 : 90;
  const overlap = 20;
  const chunks: IndexedChunk[] = [];

  for (let start = 0; start < lines.length; start += chunkSize - overlap) {
    const content = limitText(lines.slice(start, start + chunkSize).join("\n"), MAX_CHUNK_CHARS);
    if (content.trim().length === 0) {
      continue;
    }

    chunks.push({
      document,
      content,
      normalized: normalize(`${document.path}\n${content}`),
      startLine: start + 1
    });
  }

  return chunks;
}
