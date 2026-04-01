import { writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LlmCallback, ExtractConfig, ExtractResult } from './types.js';
import { scanMemoryFiles } from './core/scan.js';
import { resolvePaths, isInsideDir } from './core/paths.js';
import { buildFrontmatter } from './core/frontmatter.js';
import { parseMemoryType } from './core/memoryTypes.js';
import { parseLlmJson, isExtractionResult } from './core/llmJson.js';
import type { ExtractionResult } from './core/llmJson.js';
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
} from './prompts/extraction.js';

export async function extractMemories(
  memoryDir: string,
  llm: LlmCallback,
  config: ExtractConfig,
): Promise<ExtractResult> {
  if (config.messages.length === 0) {
    return {
      filesWritten: [],
      filesUpdated: [],
      skipped: true,
      reason: 'no messages',
    };
  }

  const { memoryDir: resolvedDir, entrypoint } = resolvePaths(memoryDir);
  const existingMemories =
    config.existingMemories ?? (await scanMemoryFiles(resolvedDir));

  const systemPrompt = buildExtractionSystemPrompt({
    memoryDir: resolvedDir,
    existingMemories,
  });
  const userPrompt = buildExtractionUserPrompt(config.messages);

  const raw = await llm({
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 4096,
  });

  const parsed: ExtractionResult | null = parseLlmJson(raw, isExtractionResult);
  if (!parsed || parsed.memories.length === 0) {
    return {
      filesWritten: [],
      filesUpdated: [],
      skipped: true,
      reason: 'nothing worth extracting',
    };
  }

  const written: string[] = [];
  const updated: string[] = [];

  for (const mem of parsed.memories) {
    if (!mem.filename || !mem.body) continue;

    const filePath = join(resolvedDir, mem.filename);

    if (!isInsideDir(resolvedDir, filePath)) continue;

    const parsedType = parseMemoryType(mem.frontmatter.type);
    const tags = Array.isArray(mem.frontmatter.tags)
      ? mem.frontmatter.tags.filter((t): t is string => typeof t === 'string')
      : undefined;
    const expires =
      typeof mem.frontmatter.expires === 'string'
        ? mem.frontmatter.expires
        : undefined;
    const fm = buildFrontmatter({
      name: mem.frontmatter.name,
      description: mem.frontmatter.description,
      type: parsedType,
      tags,
      expires,
    });

    const content = `${fm}\n\n${mem.body}\n`;
    await writeFile(filePath, content, 'utf-8');

    if (mem.action === 'create') {
      written.push(mem.filename);
    } else {
      updated.push(mem.filename);
    }
  }

  const newFiles = new Set(written);
  if (parsed.manifestEntries && parsed.manifestEntries.length > 0) {
    const createEntries = parsed.manifestEntries.filter((entry) =>
      [...newFiles].some((f) => entry.includes(f)),
    );
    if (createEntries.length > 0) {
      const newEntries = createEntries.join('\n') + '\n';
      try {
        await appendFile(entrypoint, newEntries, 'utf-8');
      } catch {
        await writeFile(entrypoint, newEntries, 'utf-8');
      }
    }
  }

  return { filesWritten: written, filesUpdated: updated, skipped: false };
}
