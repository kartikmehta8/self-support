import { MAX_INDEXED_LINE_CHARS, MAX_QUERY_CHARS, MAX_QUERY_TERMS } from "./limits.js";

export function normalize(value: string): string {
  return value.toLowerCase();
}

export function tokenize(value: string): string[] {
  return [
    ...new Set(
      normalize(value.slice(0, MAX_QUERY_CHARS))
        .split(/[^a-z0-9_/-]+/)
        .filter((term) => term.length >= 2 && term.length <= 80)
    )
  ].slice(0, MAX_QUERY_TERMS);
}

export function sanitizeLine(line: string): string {
  return limitText(line, MAX_INDEXED_LINE_CHARS);
}

export function limitText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
