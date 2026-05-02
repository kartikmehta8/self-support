export type RepositoryKey = "self" | "self-docs";

export interface SearchResult {
  repository: RepositoryKey;
  path: string;
  startLine: number;
  score: number;
  excerpt: string;
}

export interface IndexedDocument {
  repository: RepositoryKey;
  path: string;
  content: string;
  normalized: string;
}

export interface IndexedChunk {
  document: IndexedDocument;
  content: string;
  normalized: string;
  startLine: number;
}

export interface RepositorySource {
  name: RepositoryKey;
  url: string;
  path: string;
}
