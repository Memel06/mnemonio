import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMnemonioStore } from './store.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mnemonio-store-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('MnemonioStore', () => {
  describe('ensureDir', () => {
    it('creates directory and MANIFEST.md', async () => {
      const subdir = join(dir, 'memories');
      const store = createMnemonioStore({ memoryDir: subdir });
      await store.ensureDir();

      const s = await stat(subdir);
      expect(s.isDirectory()).toBe(true);

      const content = await readFile(join(subdir, 'MANIFEST.md'), 'utf-8');
      expect(content).toContain('Memory Manifest');
    });

    it('is idempotent', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await store.ensureDir();
      await store.ensureDir();

      const content = await readFile(join(dir, 'MANIFEST.md'), 'utf-8');
      expect(content).toContain('Memory Manifest');
    });

    it('does not overwrite existing MANIFEST.md', async () => {
      await writeFile(join(dir, 'MANIFEST.md'), 'custom content');
      const store = createMnemonioStore({ memoryDir: dir });
      await store.ensureDir();

      const content = await readFile(join(dir, 'MANIFEST.md'), 'utf-8');
      expect(content).toBe('custom content');
    });
  });

  describe('scan', () => {
    it('returns empty array for empty directory', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await store.ensureDir();
      const headers = await store.scan();
      expect(headers).toEqual([]);
    });

    it('finds memory files but not MANIFEST.md', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await store.ensureDir();
      await writeFile(
        join(dir, 'test.md'),
        '---\nname: test\ntype: context\n---\ncontent',
      );

      const headers = await store.scan();
      expect(headers).toHaveLength(1);
      expect(headers[0]!.filename).toBe('test.md');
      expect(headers[0]!.type).toBe('context');
    });

    it('skips non-md files', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await store.ensureDir();
      await writeFile(join(dir, 'not-a-memory.txt'), 'text');

      const headers = await store.scan();
      expect(headers).toEqual([]);
    });

    it('returns headers sorted by newest first', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await store.ensureDir();

      await writeFile(join(dir, 'old.md'), '---\nname: old\n---\ncontent');
      // Small delay to ensure different mtimes
      await new Promise((r) => setTimeout(r, 50));
      await writeFile(join(dir, 'new.md'), '---\nname: new\n---\ncontent');

      const headers = await store.scan();
      expect(headers[0]!.filename).toBe('new.md');
      expect(headers[1]!.filename).toBe('old.md');
    });
  });

  describe('readEntrypoint', () => {
    it('returns empty for missing MANIFEST.md', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      const result = await store.readEntrypoint();
      expect(result.content).toBe('');
      expect(result.wasTruncated).toBe(false);
    });

    it('returns content of MANIFEST.md', async () => {
      await writeFile(join(dir, 'MANIFEST.md'), '# Manifest\n- entry');
      const store = createMnemonioStore({ memoryDir: dir });
      const result = await store.readEntrypoint();
      expect(result.content).toContain('# Manifest');
    });
  });

  describe('stats', () => {
    it('returns zero stats for empty directory', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await store.ensureDir();
      const s = await store.stats();
      expect(s.totalFiles).toBe(0);
      expect(s.totalBytes).toBe(0);
    });

    it('counts files by type', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await store.ensureDir();
      await writeFile(
        join(dir, 'a.md'),
        '---\ntype: identity\n---\na',
      );
      await writeFile(
        join(dir, 'b.md'),
        '---\ntype: directive\n---\nb',
      );
      await writeFile(
        join(dir, 'c.md'),
        '---\ntype: directive\n---\nc',
      );

      const s = await store.stats();
      expect(s.totalFiles).toBe(3);
      expect(s.byType.identity).toBe(1);
      expect(s.byType.directive).toBe(2);
      expect(s.byType.context).toBe(0);
      expect(s.byType.bookmark).toBe(0);
    });
  });

  describe('buildPrompt', () => {
    it('produces a prompt string', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await store.ensureDir();
      const prompt = await store.buildPrompt();
      expect(prompt).toContain('Agent Memory');
      expect(prompt).toContain('identity');
      expect(prompt).toContain('directive');
    });
  });

  describe('requireLlm', () => {
    it('throws when LLM methods are called without llm config', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await expect(store.findRelevant('test')).rejects.toThrow(
        'LLM callback required',
      );
      await expect(
        store.extract({ messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toThrow('LLM callback required');
      await expect(store.distill()).rejects.toThrow('LLM callback required');
    });
  });

  describe('delete', () => {
    it('removes the file and filters manifest entry', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await store.ensureDir();
      await writeFile(join(dir, 'target.md'), '---\nname: target\n---\nContent.');
      await writeFile(join(dir, 'MANIFEST.md'), '# Manifest\n- [target](target.md) -- some memory\n- [other](other.md) -- keep\n');

      await store.delete('target.md');

      await expect(stat(join(dir, 'target.md'))).rejects.toThrow();
      const manifest = await readFile(join(dir, 'MANIFEST.md'), 'utf-8');
      expect(manifest).not.toContain('target.md');
      expect(manifest).toContain('other.md');
    });

    it('throws when file does not exist', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await store.ensureDir();
      await expect(store.delete('nonexistent.md')).rejects.toThrow();
    });

    it('succeeds even when MANIFEST.md is missing', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await writeFile(join(dir, 'target.md'), '---\nname: target\n---\nContent.');
      await store.delete('target.md');
      await expect(stat(join(dir, 'target.md'))).rejects.toThrow();
    });
  });

  describe('team memory', () => {
    it('isTeamPath returns false without teamDir configured', () => {
      const store = createMnemonioStore({ memoryDir: dir });
      expect(store.isTeamPath('/any/path')).toBe(false);
    });

    it('validateTeamWritePath throws without teamDir configured', async () => {
      const store = createMnemonioStore({ memoryDir: dir });
      await expect(store.validateTeamWritePath('file.md')).rejects.toThrow(
        'No team directory configured',
      );
    });
  });
});
