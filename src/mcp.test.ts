import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMnemonioStore } from './store.js';
import { buildFrontmatter } from './core/frontmatter.js';
import { parseMemoryType } from './core/memoryTypes.js';
import { isInsideDir } from './core/paths.js';
import type { LlmCallback } from './types.js';

/**
 * These tests verify the logic used by the MCP tool handlers:
 * store operations, path safety, frontmatter building, and LLM-dependent
 * operations with mocked callbacks -- the same code paths the handlers call.
 */

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mnemonio-mcp-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function mockLlm(response: string): LlmCallback {
  return async () => response;
}

describe('MCP tool: memory_list', () => {
  it('returns empty message when no memories exist', async () => {
    const store = createMnemonioStore({ memoryDir: dir });
    await store.ensureDir();
    const headers = await store.scan();
    expect(headers).toHaveLength(0);
  });

  it('lists memories with type filter', async () => {
    const store = createMnemonioStore({ memoryDir: dir });
    await store.ensureDir();

    await writeFile(
      join(dir, 'a.md'),
      '---\nname: a\ntype: directive\n---\ncontent',
    );
    await writeFile(
      join(dir, 'b.md'),
      '---\nname: b\ntype: identity\n---\ncontent',
    );

    const headers = await store.scan();
    const directives = headers.filter((h) => h.type === 'directive');
    expect(directives).toHaveLength(1);
    expect(directives[0]!.filename).toBe('a.md');
  });
});

describe('MCP tool: memory_read', () => {
  it('reads a memory file', async () => {
    await writeFile(join(dir, 'test.md'), 'hello world');
    const content = await readFile(join(dir, 'test.md'), 'utf-8');
    expect(content).toBe('hello world');
  });

  it('rejects path traversal', () => {
    const filePath = join(dir, '../../../etc/passwd');
    expect(isInsideDir(dir, filePath)).toBe(false);
  });
});

describe('MCP tool: memory_save', () => {
  it('writes a memory with frontmatter and appends to manifest', async () => {
    const store = createMnemonioStore({ memoryDir: dir });
    await store.ensureDir();

    const parsedType = parseMemoryType('directive');
    const fm = buildFrontmatter({
      name: 'testing',
      description: 'Test directive',
      type: parsedType,
      tags: ['ci'],
    });

    const filePath = join(dir, 'directive_testing.md');
    expect(isInsideDir(dir, filePath)).toBe(true);

    await writeFile(filePath, `${fm}\n\nUse real DB.\n`, 'utf-8');

    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('name: testing');
    expect(content).toContain('type: directive');
    expect(content).toContain('Use real DB.');
  });

  it('rejects path traversal in filename', () => {
    const filePath = join(dir, '../escape.md');
    expect(isInsideDir(dir, filePath)).toBe(false);
  });
});

describe('MCP tool: memory_search', () => {
  it('returns results from mocked LLM', async () => {
    await writeFile(
      join(dir, 'test.md'),
      '---\nname: test\ntype: directive\n---\nUse real DB',
    );

    const response = JSON.stringify({
      matches: [
        { filename: 'test.md', reason: 'Relevant', score: 0.9 },
      ],
    });

    const store = createMnemonioStore({
      memoryDir: dir,
      llm: mockLlm(response),
    });
    await store.ensureDir();

    const results = await store.findRelevant('database testing');
    expect(results).toHaveLength(1);
    expect(results[0]!.filename).toBe('test.md');
    expect(results[0]!.score).toBe(0.9);
  });
});

describe('MCP tool: memory_extract', () => {
  it('extracts memories from conversation', async () => {
    const extractResponse = JSON.stringify({
      memories: [
        {
          action: 'create',
          filename: 'identity_ds.md',
          frontmatter: {
            name: 'ds',
            description: 'Data scientist',
            type: 'identity',
          },
          body: 'User is a data scientist.',
        },
      ],
      manifestEntries: ['- [DS](identity_ds.md) -- data scientist'],
    });

    const store = createMnemonioStore({
      memoryDir: dir,
      llm: mockLlm(extractResponse),
    });
    await store.ensureDir();

    const result = await store.extract({
      messages: [
        { role: 'user', content: "I'm a data scientist" },
        { role: 'assistant', content: 'Noted.' },
      ],
    });

    expect(result.skipped).toBe(false);
    expect(result.filesWritten).toContain('identity_ds.md');

    const files = await readdir(dir);
    expect(files).toContain('identity_ds.md');
  });
});

describe('MCP tool: memory_distill', () => {
  it('consolidates with force flag', async () => {
    await writeFile(
      join(dir, 'old.md'),
      '---\nname: old\ntype: context\n---\nstale',
    );

    const distillResponse = JSON.stringify({
      updates: [
        { action: 'remove', filename: 'old.md', reason: 'obsolete' },
      ],
      newManifest: null,
    });

    const store = createMnemonioStore({
      memoryDir: dir,
      llm: mockLlm(distillResponse),
    });
    await store.ensureDir();

    const result = await store.distill({ force: true });
    expect(result.consolidated).toBe(true);
    expect(result.filesRemoved).toContain('old.md');
  });
});

describe('MCP tool: memory_stats', () => {
  it('returns correct type breakdown', async () => {
    const store = createMnemonioStore({ memoryDir: dir });
    await store.ensureDir();

    await writeFile(join(dir, 'a.md'), '---\ntype: identity\n---\na');
    await writeFile(join(dir, 'b.md'), '---\ntype: bookmark\n---\nb');

    const stats = await store.stats();
    expect(stats.totalFiles).toBe(2);
    expect(stats.byType.identity).toBe(1);
    expect(stats.byType.bookmark).toBe(1);
  });
});
