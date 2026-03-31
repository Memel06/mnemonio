import { readFile } from 'node:fs/promises';
import type { LlmCallback, MemoryHeader, RelevantMemory } from './types.js';
import { formatMemoryManifest } from './core/scan.js';
import { parseLlmJson, isRelevanceResult } from './core/llmJson.js';

interface RelevanceConfig {
  readonly llm: LlmCallback;
  readonly memoryDir: string;
  readonly headers: ReadonlyArray<MemoryHeader>;
  readonly query: string;
  readonly maxResults?: number;
}

export async function findRelevantMemories(
  config: RelevanceConfig,
): Promise<ReadonlyArray<RelevantMemory>> {
  const { llm, memoryDir, headers, query, maxResults = 5 } = config;

  if (headers.length === 0) return [];

  const manifest = formatMemoryManifest(headers, memoryDir);

  const contents: string[] = [];
  for (const h of headers) {
    try {
      const content = await readFile(h.filePath, 'utf-8');
      contents.push(`### ${h.filename}\n${content}`);
    } catch {
      contents.push(`### ${h.filename}\n(unreadable)`);
    }
  }

  const system = [
    'You are a memory relevance scorer. Given a query and a set of memory files, determine which memories are relevant.',
    '',
    'Return a JSON object with a "matches" array. Each match has:',
    '- "filename": the memory file name',
    '- "reason": why it\'s relevant (one sentence)',
    '- "score": relevance score from 0.0 to 1.0',
    '',
    `Return at most ${String(maxResults)} matches. Only include memories with score >= 0.3.`,
    'If nothing is relevant, return: { "matches": [] }',
  ].join('\n');

  const userMsg = [
    `## Query\n\n${query}`,
    '',
    `## Available Memories\n\n${manifest}`,
    '',
    `## Memory Contents\n\n${contents.join('\n\n')}`,
  ].join('\n');

  const raw = await llm({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 1024,
  });

  const parsed = parseLlmJson(raw, isRelevanceResult);
  if (!parsed) return [];

  return parsed.matches
    .filter((m) => m.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((m) => {
      const header = headers.find((h) => h.filename === m.filename);
      return {
        filename: m.filename,
        filePath: header?.filePath ?? '',
        reason: typeof m.reason === 'string' ? m.reason : '',
        score: m.score,
      };
    });
}
