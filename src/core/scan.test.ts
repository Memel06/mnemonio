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

  it('excludes expired memories', async () => {
    await writeFile(
      join(dir, 'expired.md'),
      '---\nname: old\ndescription: Old memory\nexpires: "2020-01-01"\n---\nOld.',
    );
    await writeFile(
      join(dir, 'valid.md'),
      '---\nname: current\ndescription: Current memory\nexpires: "2099-01-01"\n---\nNew.',
    );
    const result = await scanMemoryFiles(dir);
    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe('valid.md');
  });

  it('includes memories with no expiry', async () => {
    await writeFile(
      join(dir, 'no-expiry.md'),
      '---\nname: no-expiry\ndescription: No expiry\n---\nContent.',
    );
    const result = await scanMemoryFiles(dir);
    expect(result).toHaveLength(1);
  });

  it('populates tags from frontmatter', async () => {
    await writeFile(
      join(dir, 'tagged.md'),
      '---\nname: tagged\ntags:\n  - foo\n  - bar\n---\nContent.',
    );
    const result = await scanMemoryFiles(dir);
    expect(result[0]!.tags).toEqual(['foo', 'bar']);
  });

  it('returns empty tags array when no tags in frontmatter', async () => {
    await writeFile(join(dir, 'untagged.md'), '---\nname: untagged\n---\nContent.');
    const result = await scanMemoryFiles(dir);
    expect(result[0]!.tags).toEqual([]);
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
        tags: [] as string[],
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
        tags: [] as string[],
      },
    ];
    const result = formatMemoryManifest(headers, dir);
    expect(result).toContain('test.md');
    expect(result).not.toContain('null');
  });
});
