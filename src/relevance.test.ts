import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { LlmCallback, MemoryHeader } from './types.js';
import { findRelevantMemories } from './relevance.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mnemonio-relevance-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function mockLlm(response: string): LlmCallback {
  return async () => response;
}

function makeHeader(filename: string): MemoryHeader {
  return {
    filename,
    filePath: join(dir, filename),
    mtimeMs: Date.now(),
    description: `description of ${filename}`,
    type: 'context',
  };
}

describe('findRelevantMemories', () => {
  it('returns empty when no headers provided', async () => {
    const llm = mockLlm('');
    const result = await findRelevantMemories({
      llm,
      memoryDir: dir,
      headers: [],
      query: 'test',
    });
    expect(result).toEqual([]);
  });

  it('returns scored matches from LLM', async () => {
    await writeFile(
      join(dir, 'testing.md'),
      '---\nname: testing\ntype: directive\n---\nUse real DB.',
    );

    const response = JSON.stringify({
      matches: [
        { filename: 'testing.md', reason: 'Directly relevant', score: 0.9 },
      ],
    });
    const llm = mockLlm(response);

    const result = await findRelevantMemories({
      llm,
      memoryDir: dir,
      headers: [makeHeader('testing.md')],
      query: 'database testing',
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe('testing.md');
    expect(result[0]!.score).toBe(0.9);
    expect(result[0]!.reason).toBe('Directly relevant');
  });

  it('filters matches below 0.3 threshold', async () => {
    await writeFile(join(dir, 'a.md'), 'content a');
    await writeFile(join(dir, 'b.md'), 'content b');

    const response = JSON.stringify({
      matches: [
        { filename: 'a.md', reason: 'good', score: 0.8 },
        { filename: 'b.md', reason: 'weak', score: 0.1 },
      ],
    });
    const llm = mockLlm(response);

    const result = await findRelevantMemories({
      llm,
      memoryDir: dir,
      headers: [makeHeader('a.md'), makeHeader('b.md')],
      query: 'test',
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe('a.md');
  });

  it('respects maxResults', async () => {
    await writeFile(join(dir, 'a.md'), 'a');
    await writeFile(join(dir, 'b.md'), 'b');
    await writeFile(join(dir, 'c.md'), 'c');

    const response = JSON.stringify({
      matches: [
        { filename: 'a.md', reason: 'x', score: 0.9 },
        { filename: 'b.md', reason: 'x', score: 0.8 },
        { filename: 'c.md', reason: 'x', score: 0.7 },
      ],
    });
    const llm = mockLlm(response);

    const result = await findRelevantMemories({
      llm,
      memoryDir: dir,
      headers: [makeHeader('a.md'), makeHeader('b.md'), makeHeader('c.md')],
      query: 'test',
      maxResults: 2,
    });

    expect(result).toHaveLength(2);
  });

  it('sorts by descending score', async () => {
    await writeFile(join(dir, 'a.md'), 'a');
    await writeFile(join(dir, 'b.md'), 'b');

    const response = JSON.stringify({
      matches: [
        { filename: 'a.md', reason: 'x', score: 0.5 },
        { filename: 'b.md', reason: 'x', score: 0.9 },
      ],
    });
    const llm = mockLlm(response);

    const result = await findRelevantMemories({
      llm,
      memoryDir: dir,
      headers: [makeHeader('a.md'), makeHeader('b.md')],
      query: 'test',
    });

    expect(result[0]!.filename).toBe('b.md');
    expect(result[1]!.filename).toBe('a.md');
  });

  it('handles invalid LLM response', async () => {
    await writeFile(join(dir, 'a.md'), 'a');
    const llm = mockLlm('Sorry, I cannot help with that.');
    const result = await findRelevantMemories({
      llm,
      memoryDir: dir,
      headers: [makeHeader('a.md')],
      query: 'test',
    });
    expect(result).toEqual([]);
  });
});
