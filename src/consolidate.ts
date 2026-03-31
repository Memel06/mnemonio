import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { LlmCallback, DistillConfig, DistillResult } from './types.js';
import { scanMemoryFiles } from './core/scan.js';
import { resolvePaths, isInsideDir } from './core/paths.js';
import { parseLlmJson, isConsolidationResult } from './core/llmJson.js';
import type { ConsolidationResult } from './core/llmJson.js';
import {
  tryAcquireLock,
  releaseLock,
  readLastDistilledAt,
  touchLastDistilled,
} from './lock.js';
import {
  buildConsolidationSystemPrompt,
  buildConsolidationUserPrompt,
} from './prompts/consolidation.js';

const DEFAULT_MIN_IDLE_MS = 5 * 60 * 1000;
const MAX_INPUT_BYTES = 100_000;

export async function distill(
  memoryDir: string,
  llm: LlmCallback,
  config?: DistillConfig,
): Promise<DistillResult> {
  const force = config?.force ?? false;
  const minIdleMs = config?.minIdleMs ?? DEFAULT_MIN_IDLE_MS;

  if (!force) {
    const lastDistilled = await readLastDistilledAt(memoryDir);
    if (lastDistilled > 0 && Date.now() - lastDistilled < minIdleMs) {
      return {
        consolidated: false,
        filesModified: [],
        filesRemoved: [],
        reason: 'too soon since last distillation',
      };
    }
  }

  const lockTime = await tryAcquireLock(memoryDir);
  if (lockTime === null) {
    return {
      consolidated: false,
      filesModified: [],
      filesRemoved: [],
      reason: 'lock held by another process',
    };
  }

  const { memoryDir: resolvedDir } = resolvePaths(memoryDir);

  try {
    const headers = await scanMemoryFiles(resolvedDir);
    if (headers.length === 0) {
      return {
        consolidated: false,
        filesModified: [],
        filesRemoved: [],
        reason: 'no memories to consolidate',
      };
    }

    const contents: Array<{ filename: string; content: string }> = [];
    let totalBytes = 0;
    for (const h of headers) {
      try {
        const content = await readFile(h.filePath, 'utf-8');
        const byteLen = Buffer.byteLength(content, 'utf-8');
        if (totalBytes + byteLen > MAX_INPUT_BYTES) break;
        totalBytes += byteLen;
        contents.push({ filename: h.filename, content });
      } catch {
        // Skip unreadable files
      }
    }

    if (contents.length === 0) {
      return {
        consolidated: false,
        filesModified: [],
        filesRemoved: [],
        reason: 'no readable memories',
      };
    }

    const systemPrompt = buildConsolidationSystemPrompt();
    const userPrompt = buildConsolidationUserPrompt({
      memoryDir: resolvedDir,
      headers,
      memoryContents: contents,
    });

    const raw = await llm({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 8192,
    });

    const parsed: ConsolidationResult | null = parseLlmJson(raw, isConsolidationResult);
    if (!parsed || parsed.updates.length === 0) {
      await touchLastDistilled(resolvedDir);
      return {
        consolidated: false,
        filesModified: [],
        filesRemoved: [],
        reason: 'no changes needed',
      };
    }

    const modified: string[] = [];
    const removed: string[] = [];

    for (const update of parsed.updates) {
      const filePath = join(resolvedDir, update.filename);

      if (!isInsideDir(resolvedDir, filePath)) continue;

      if (update.action === 'remove') {
        try {
          await unlink(filePath);
          removed.push(update.filename);
        } catch {
          // File might not exist
        }
        continue;
      }

      if (update.action === 'merge' && update.mergeInto) {
        const targetPath = join(resolvedDir, update.mergeInto);
        if (!isInsideDir(resolvedDir, targetPath)) continue;

        try {
          await unlink(filePath);
          removed.push(update.filename);
        } catch {
          // File might not exist
        }

        if (update.newContent) {
          await writeFile(targetPath, update.newContent, 'utf-8');
          if (!modified.includes(update.mergeInto)) {
            modified.push(update.mergeInto);
          }
        }
        continue;
      }

      if (update.action === 'update' && update.newContent) {
        await writeFile(filePath, update.newContent, 'utf-8');
        modified.push(update.filename);
      }
    }

    if (parsed.newManifest) {
      const { entrypoint } = resolvePaths(resolvedDir);
      await writeFile(entrypoint, parsed.newManifest, 'utf-8');
    }

    await touchLastDistilled(resolvedDir);
    return { consolidated: true, filesModified: modified, filesRemoved: removed };
  } finally {
    await releaseLock(resolvedDir);
  }
}
