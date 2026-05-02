import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import type { AppLogger } from "../utils/logger.js";
import { chunkDocument } from "./knowledge/chunking.js";
import { IGNORED_DIRS, looksMinified, shouldIndexFile } from "./knowledge/file-filter.js";
import { MAX_EXCERPT_CHARS, MAX_INDEXED_FILE_BYTES } from "./knowledge/limits.js";
import { excerptFor, scoreChunk, selectDiverseChunks } from "./knowledge/search.js";
import { limitText, normalize, sanitizeLine, tokenize } from "./knowledge/text.js";
import type {
  IndexedChunk,
  IndexedDocument,
  RepositoryKey,
  RepositorySource,
  SearchResult
} from "./knowledge/types.js";

const execFileAsync = promisify(execFile);

export type { SearchResult } from "./knowledge/types.js";

/**
 * Maintains local repository mirrors and a lightweight searchable text index.
 */
export class KnowledgeBaseService {
  private readonly sources: RepositorySource[];
  private index: IndexedDocument[] = [];
  private chunks: IndexedChunk[] = [];
  private refreshTimer?: NodeJS.Timeout;

  /**
   * Creates the knowledge service.
   *
   * @param config Application configuration.
   * @param logger Application logger.
   */
  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger
  ) {
    this.sources = [
      {
        name: "self",
        url: config.knowledge.selfRepoUrl,
        path: join(config.knowledge.repoBasePath, "self")
      },
      {
        name: "self-docs",
        url: config.knowledge.selfDocsRepoUrl,
        path: join(config.knowledge.repoBasePath, "self-docs")
      }
    ];
  }

  /**
   * Clones or updates repositories and builds the initial index.
   *
   * @returns Promise that resolves after indexing.
   */
  async start(): Promise<void> {
    await this.refresh();
    this.refreshTimer = setInterval(() => {
      void this.refresh().catch((error) => {
        this.logger.error({ error }, "Repository refresh failed");
      });
    }, this.config.knowledge.refreshCronMs);
  }

  /**
   * Stops scheduled repository refreshes.
   *
   * @returns Promise that resolves after shutdown.
   */
  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  /**
   * Refreshes repositories and rebuilds the local index.
   *
   * @returns Promise that resolves with indexed document count.
   */
  async refresh(): Promise<number> {
    await mkdir(this.config.knowledge.repoBasePath, { recursive: true });

    for (const source of this.sources) {
      await this.syncRepository(source);
    }

    const nextIndex: IndexedDocument[] = [];
    const nextChunks: IndexedChunk[] = [];
    for (const source of this.sources) {
      const files = await this.walk(source.path);
      for (const file of files) {
        const content = await this.safeRead(file);
        if (!content) {
          continue;
        }

        const relativePath = relative(source.path, file);
        const document: IndexedDocument = {
          repository: source.name,
          path: relativePath,
          content,
          normalized: normalize(`${relativePath}\n${content}`)
        };

        nextIndex.push(document);
        nextChunks.push(...chunkDocument(document));
      }
    }

    this.index = nextIndex;
    this.chunks = nextChunks;
    this.logger.info(
      { documents: this.index.length, chunks: this.chunks.length },
      "Knowledge base index refreshed"
    );
    return this.index.length;
  }

  /**
   * Searches indexed source and docs content.
   *
   * @param query Natural-language or code search query.
   * @param limit Maximum number of results.
   * @returns Ranked search results.
   */
  async search(
    query: string,
    limit = this.config.knowledge.maxSearchResults
  ): Promise<SearchResult[]> {
    const terms = tokenize(query);
    if (terms.length === 0) {
      return [];
    }

    const ranked = this.chunks
      .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return selectDiverseChunks(ranked, limit).map(({ chunk, score }) => ({
      repository: chunk.document.repository,
      path: chunk.document.path,
      startLine: chunk.startLine,
      score,
      excerpt: excerptFor(chunk.content, terms, chunk.startLine)
    }));
  }

  /**
   * Reads a bounded excerpt from an indexed file.
   *
   * @param repository Repository key.
   * @param path Relative file path within that repository.
   * @param startLine One-based start line.
   * @param lineCount Number of lines to return.
   * @returns File excerpt with line numbers.
   */
  async getFileExcerpt(
    repository: RepositoryKey,
    path: string,
    startLine = 1,
    lineCount = 80
  ): Promise<string> {
    const doc = this.index.find((entry) => entry.repository === repository && entry.path === path);
    if (!doc) {
      throw new AppError(`File ${repository}/${path} is not indexed`);
    }

    const lines = doc.content.split(/\r?\n/).map(sanitizeLine);
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, start + Math.max(1, Math.min(lineCount, 80)));

    return limitText(
      lines
        .slice(start, end)
        .map((line, index) => `${start + index + 1}: ${line}`)
        .join("\n"),
      MAX_EXCERPT_CHARS
    );
  }

  private async syncRepository(source: RepositorySource): Promise<void> {
    if (!existsSync(join(source.path, ".git"))) {
      this.logger.info({ repository: source.name, url: source.url }, "Cloning repository");
      await execFileAsync("git", ["clone", "--depth=1", source.url, source.path]);
      return;
    }

    this.logger.info({ repository: source.name }, "Pulling repository");
    await execFileAsync("git", ["-C", source.path, "pull", "--ff-only"]);
  }

  private async walk(root: string): Promise<string[]> {
    const entries = await readdir(root);
    const files: string[] = [];

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry)) {
        continue;
      }

      const absolute = join(root, entry);
      const details = await stat(absolute);

      if (details.isDirectory()) {
        files.push(...(await this.walk(absolute)));
      } else if (
        details.isFile() &&
        shouldIndexFile(absolute) &&
        details.size <= MAX_INDEXED_FILE_BYTES
      ) {
        files.push(absolute);
      }
    }

    return files;
  }

  private async safeRead(file: string): Promise<string | undefined> {
    try {
      const content = await readFile(file, "utf8");
      if (looksMinified(file, content)) {
        this.logger.debug({ file }, "Skipping likely generated or minified file");
        return undefined;
      }

      return content;
    } catch (error) {
      this.logger.debug({ error, file }, "Skipping unreadable file");
      return undefined;
    }
  }
}
