/** Callback wrapping any LLM provider */
export type LlmCallback = (params: {
  readonly system: string;
  readonly messages: ReadonlyArray<{
    readonly role: 'user' | 'assistant';
    readonly content: string;
  }>;
  readonly maxTokens: number;
  readonly jsonSchema?: Record<string, unknown>;
}) => Promise<string>;

export type MemoryType = 'identity' | 'directive' | 'context' | 'bookmark';

export interface MemoryFrontmatter {
  readonly name?: string;
  readonly description?: string;
  readonly type?: MemoryType;
  readonly tags?: ReadonlyArray<string>;
  readonly expires?: string;
}

export interface MemoryHeader {
  readonly filename: string;
  readonly filePath: string;
  readonly mtimeMs: number;
  readonly description: string | null;
  readonly type: MemoryType | undefined;
}

export interface MnemonioConfig {
  readonly memoryDir: string;
  readonly teamDir?: string;
  readonly llm?: LlmCallback;
  readonly entrypointName?: string;
  readonly maxEntrypointLines?: number;
  readonly maxEntrypointBytes?: number;
  readonly logger?: (
    msg: string,
    level: 'debug' | 'info' | 'warn' | 'error',
  ) => void;
}

export interface EntrypointTruncation {
  readonly content: string;
  readonly wasTruncated: boolean;
  readonly originalLines: number;
  readonly keptLines: number;
  readonly originalBytes: number;
  readonly keptBytes: number;
}

export interface MnemonioStats {
  readonly totalFiles: number;
  readonly totalBytes: number;
  readonly byType: Readonly<Record<MemoryType | 'unknown', number>>;
  readonly oldestMtimeMs: number | null;
  readonly newestMtimeMs: number | null;
}

export interface RelevantMemory {
  readonly filename: string;
  readonly filePath: string;
  readonly reason: string;
  readonly score: number;
}

export interface ExtractConfig {
  readonly messages: ReadonlyArray<{
    readonly role: 'user' | 'assistant';
    readonly content: string;
  }>;
  readonly existingMemories?: ReadonlyArray<MemoryHeader>;
}

export interface ExtractResult {
  readonly filesWritten: ReadonlyArray<string>;
  readonly filesUpdated: ReadonlyArray<string>;
  readonly skipped: boolean;
  readonly reason?: string;
}

export interface DistillConfig {
  readonly minIdleMs?: number;
  readonly minSessionGap?: number;
  readonly force?: boolean;
}

export interface DistillResult {
  readonly consolidated: boolean;
  readonly filesModified: ReadonlyArray<string>;
  readonly filesRemoved: ReadonlyArray<string>;
  readonly reason?: string;
}
