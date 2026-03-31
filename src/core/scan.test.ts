import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanMemoryFiles, formatMemoryManifest } from './scan.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mnemonio-scan-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('scanMemoryFiles', () => {
  it('returns empty for empty directory', async () => {
    const result = await scanMemoryFiles(dir);
    expect(result).toEqual([]);
  });

  it('returns empty for non-existent directory', async () => {
    const result = await scanMemoryFiles('/nonexistent/path');
    expect(result).toEqual([]);
  });

  it('finds .md files with frontmatter', async () => {
    await writeFile(
      join(dir, 'test.md'),
      '---\nname: test\ndescription: A test\ntype: directive\n---\nBody.',
    );
    const result = await scanMemoryFiles(dir);
    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe('test.md');
    expect(result[0]!.description).toBe('A test');
    expect(result[0]!.type).toBe('directive');
  });

  it('excludes MANIFEST.md', async () => {
    await writeFile(join(dir, 'MANIFEST.md'), '# Manifest');
    await writeFile(join(dir, 'real.md'), '---\nname: real\n---\nBody.');
    const result = await scanMemoryFiles(dir);
    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe('real.md');
  });

  it('excludes non-.md files', async () => {
    await writeFile(join(dir, 'notes.txt'), 'text');
    await writeFile(join(dir, 'data.json'), '{}');
    const result = await scanMemoryFiles(dir);
    expect(result).toEqual([]);
  });

  it('handles files without frontmatter', async () => {
    await writeFile(join(dir, 'plain.md'), 'Just plain text.');
    const result = await scanMemoryFiles(dir);
    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBeNull();
    expect(result[0]!.type).toBeUndefined();
  });

  it('respects abort signal', async () => {
    await writeFile(join(dir, 'a.md'), 'content');
    const controller = new AbortController();
    controller.abort();
    const result = await scanMemoryFiles(dir, controller.signal);
    expect(result).toEqual([]);
  });
});

describe('formatMemoryManifest', () => {
  it('returns placeholder for empty headers', () => {
    expect(formatMemoryManifest([], dir)).toBe('(no memory files)');
  });

  it('formats headers with type and description', () => {
    const headers = [
      {
        filename: 'test.md',
        filePath: join(dir, 'test.md'),
        mtimeMs: Date.now(),
        description: 'A test memory',
        type: 'directive' as const,
      },
    ];
    const result = formatMemoryManifest(headers, dir);
    expect(result).toContain('test.md');
    expect(result).toContain('[directive]');
    expect(result).toContain('A test memory');
  });

  it('handles missing description', () => {
    const headers = [
      {
        filename: 'test.md',
        filePath: join(dir, 'test.md'),
        mtimeMs: Date.now(),
        description: null,
        type: undefined,
      },
    ];
    const result = formatMemoryManifest(headers, dir);
    expect(result).toContain('test.md');
    expect(result).not.toContain('null');
  });
});
