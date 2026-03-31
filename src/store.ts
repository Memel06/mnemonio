import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import type {
  MnemonioConfig,
  EntrypointTruncation,
  MnemonioStats,
  MemoryHeader,
  MemoryType,
  RelevantMemory,
  ExtractConfig,
  ExtractResult,
  DistillConfig,
  DistillResult,
  LlmCallback,
} from './types.js';
import { resolvePaths } from './core/paths.js';
import { scanMemoryFiles, formatMemoryManifest } from './core/scan.js';
import { truncateEntrypointContent } from './core/truncate.js';
import { buildMemoryPrompt } from './prompts/individual.js';
import { buildCombinedPrompt } from './prompts/combined.js';
import { findRelevantMemories } from './relevance.js';
import { extractMemories } from './extract.js';
import { distill } from './consolidate.js';
import {
  tryAcquireLock,
  rollbackLock,
  readLastDistilledAt,
} from './lock.js';
import {
  validateTeamPath,
  isTeamPath as checkIsTeamPath,
} from './team/teamPaths.js';

export class MnemonioStore {
  private readonly config: MnemonioConfig;
  private readonly paths: ReturnType<typeof resolvePaths>;
  private readonly log: (
    msg: string,
    level: 'debug' | 'info' | 'warn' | 'error',
  ) => void;

  constructor(config: MnemonioConfig) {
    this.config = config;
    this.paths = resolvePaths(config.memoryDir, config.entrypointName);
    this.log = config.logger ?? (() => {});
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.paths.memoryDir, { recursive: true });

    try {
      await stat(this.paths.entrypoint);
    } catch {
      await writeFile(
        this.paths.entrypoint,
        '# Memory Manifest\n\nStored memories are listed below.\n',
        'utf-8',
      );
      this.log('Created MANIFEST.md', 'info');
    }
  }

  async scan(signal?: AbortSignal): Promise<ReadonlyArray<MemoryHeader>> {
    return scanMemoryFiles(this.paths.memoryDir, signal);
  }

  async readEntrypoint(): Promise<EntrypointTruncation> {
    const maxLines = this.config.maxEntrypointLines ?? 200;
    const maxBytes = this.config.maxEntrypointBytes ?? 25_000;

    try {
      const raw = await readFile(this.paths.entrypoint, 'utf-8');
      return truncateEntrypointContent(raw, maxLines, maxBytes);
    } catch {
      return {
        content: '',
        wasTruncated: false,
        originalLines: 0,
        keptLines: 0,
        originalBytes: 0,
        keptBytes: 0,
      };
    }
  }

  async buildPrompt(): Promise<string> {
    return buildMemoryPrompt(this.config);
  }

  async buildCombinedPrompt(): Promise<string> {
    return buildCombinedPrompt(this.config);
  }

  formatManifest(headers: ReadonlyArray<MemoryHeader>): string {
    return formatMemoryManifest(headers, this.paths.memoryDir);
  }

  async stats(signal?: AbortSignal): Promise<MnemonioStats> {
    const headers = await this.scan(signal);

    const byType: Record<MemoryType | 'unknown', number> = {
      identity: 0,
      directive: 0,
      context: 0,
      bookmark: 0,
      unknown: 0,
    };

    let totalBytes = 0;
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const h of headers) {
      const typeKey: MemoryType | 'unknown' = h.type ?? 'unknown';
      byType[typeKey]++;

      try {
        const s = await stat(h.filePath);
        totalBytes += s.size;
      } catch {
        // Skip unreadable files
      }

      if (oldest === null || h.mtimeMs < oldest) oldest = h.mtimeMs;
      if (newest === null || h.mtimeMs > newest) newest = h.mtimeMs;
    }

    return {
      totalFiles: headers.length,
      totalBytes,
      byType,
      oldestMtimeMs: oldest,
      newestMtimeMs: newest,
    };
  }

  async findRelevant(
    query: string,
    opts?: { readonly maxResults?: number },
  ): Promise<ReadonlyArray<RelevantMemory>> {
    const llm = this.requireLlm();
    const headers = await this.scan();
    return findRelevantMemories({
      llm,
      memoryDir: this.paths.memoryDir,
      headers,
      query,
      maxResults: opts?.maxResults,
    });
  }

  async extract(config: ExtractConfig): Promise<ExtractResult> {
    const llm = this.requireLlm();
    return extractMemories(this.paths.memoryDir, llm, config);
  }

  async distill(config?: DistillConfig): Promise<DistillResult> {
    const llm = this.requireLlm();
    return distill(this.paths.memoryDir, llm, config);
  }

  async readLastDistilledAt(): Promise<number> {
    return readLastDistilledAt(this.paths.memoryDir);
  }

  async tryAcquireLock(): Promise<number | null> {
    return tryAcquireLock(this.paths.memoryDir);
  }

  async rollbackLock(priorMtime: number): Promise<void> {
    return rollbackLock(this.paths.memoryDir, priorMtime);
  }

  async validateTeamWritePath(filePath: string): Promise<string> {
    if (!this.config.teamDir) {
      throw new Error('No team directory configured');
    }
    return validateTeamPath(this.config.teamDir, filePath);
  }

  isTeamPath(filePath: string): boolean {
    if (!this.config.teamDir) return false;
    return checkIsTeamPath(this.config.teamDir, filePath);
  }

  private requireLlm(): LlmCallback {
    if (!this.config.llm) {
      throw new Error(
        'LLM callback required for this operation. Pass `llm` in MnemonioConfig.',
      );
    }
    return this.config.llm;
  }
}

export function createMnemonioStore(config: MnemonioConfig): MnemonioStore {
  return new MnemonioStore(config);
}
