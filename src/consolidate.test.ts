import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { LlmCallback } from './types.js';
import { distill } from './consolidate.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mnemonio-distill-'));
  await writeFile(
    join(dir, 'MANIFEST.md'),
    '# Memory Manifest\n',
    'utf-8',
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function mockLlm(response: string): LlmCallback {
  return async () => response;
}

async function writeMemory(filename: string, content: string): Promise<void> {
  await writeFile(join(dir, filename), content, 'utf-8');
}

describe('distill', () => {
  it('skips when no memory files exist', async () => {
    const llm = mockLlm('');
    const result = await distill(dir, llm, { force: true });
    expect(result.consolidated).toBe(false);
    expect(result.reason).toBe('no memories to consolidate');
  });

  it('respects time gate unless forced', async () => {
    await writeMemory('test.md', '---\nname: test\ntype: context\n---\ncontent');

    // Touch the last-distilled marker
    await writeFile(join(dir, '.last-distilled'), new Date().toISOString());

    const llm = mockLlm('{"updates": [], "newManifest": null}');
    const result = await distill(dir, llm);
    expect(result.consolidated).toBe(false);
    expect(result.reason).toBe('too soon since last distillation');
  });

  it('removes files when LLM says to', async () => {
    await writeMemory(
      'stale.md',
      '---\nname: stale\ntype: context\n---\nold info',
    );

    const response = JSON.stringify({
      updates: [
        { action: 'remove', filename: 'stale.md', reason: 'obsolete' },
      ],
      newManifest: null,
    });
    const llm = mockLlm(response);

    const result = await distill(dir, llm, { force: true });
    expect(result.consolidated).toBe(true);
    expect(result.filesRemoved).toContain('stale.md');

    const files = await readdir(dir);
    expect(files).not.toContain('stale.md');
  });

  it('updates files when LLM says to', async () => {
    await writeMemory(
      'messy.md',
      '---\nname: messy\ntype: directive\n---\nverbose content here',
    );

    const response = JSON.stringify({
      updates: [
        {
          action: 'update',
          filename: 'messy.md',
          newContent: '---\nname: clean\ntype: directive\n---\ntight content',
          reason: 'tighten prose',
        },
      ],
      newManifest: null,
    });
    const llm = mockLlm(response);

    const result = await distill(dir, llm, { force: true });
    expect(result.consolidated).toBe(true);
    expect(result.filesModified).toContain('messy.md');

    const content = await readFile(join(dir, 'messy.md'), 'utf-8');
    expect(content).toContain('tight content');
  });

  it('merges files when LLM says to', async () => {
    await writeMemory('a.md', '---\nname: a\ntype: directive\n---\nfirst');
    await writeMemory('b.md', '---\nname: b\ntype: directive\n---\nsecond');

    const response = JSON.stringify({
      updates: [
        {
          action: 'merge',
          filename: 'b.md',
          mergeInto: 'a.md',
          newContent: '---\nname: merged\ntype: directive\n---\nboth combined',
          reason: 'duplicates',
        },
      ],
      newManifest: null,
    });
    const llm = mockLlm(response);

    const result = await distill(dir, llm, { force: true });
    expect(result.consolidated).toBe(true);
    expect(result.filesRemoved).toContain('b.md');
    expect(result.filesModified).toContain('a.md');

    const merged = await readFile(join(dir, 'a.md'), 'utf-8');
    expect(merged).toContain('both combined');
  });

  it('blocks path traversal in filenames', async () => {
    await writeMemory('real.md', '---\nname: real\ntype: context\n---\ncontent');

    const response = JSON.stringify({
      updates: [
        {
          action: 'update',
          filename: '../../../etc/passwd',
          newContent: 'hacked',
          reason: 'evil',
        },
      ],
      newManifest: null,
    });
    const llm = mockLlm(response);

    const result = await distill(dir, llm, { force: true });
    // Traversal path should be silently skipped
    expect(result.filesModified).toHaveLength(0);
  });

  it('blocks path traversal in mergeInto target', async () => {
    await writeMemory('src.md', '---\nname: src\ntype: context\n---\ncontent');

    const response = JSON.stringify({
      updates: [
        {
          action: 'merge',
          filename: 'src.md',
          mergeInto: '../../../tmp/evil.md',
          newContent: 'hacked',
          reason: 'evil',
        },
      ],
      newManifest: null,
    });
    const llm = mockLlm(response);

    const result = await distill(dir, llm, { force: true });
    expect(result.filesModified).toHaveLength(0);
  });

  it('rewrites manifest when LLM provides newManifest', async () => {
    await writeMemory('test.md', '---\nname: test\ntype: context\n---\ncontent');

    const response = JSON.stringify({
      updates: [
        {
          action: 'update',
          filename: 'test.md',
          newContent: '---\nname: test\ntype: context\n---\ntightened',
          reason: 'tighten',
        },
      ],
      newManifest: '# Memory Manifest\n\n- [Test](test.md) -- updated\n',
    });
    const llm = mockLlm(response);

    await distill(dir, llm, { force: true });

    const manifest = await readFile(join(dir, 'MANIFEST.md'), 'utf-8');
    expect(manifest).toContain('updated');
  });

  it('handles invalid LLM response gracefully', async () => {
    await writeMemory('test.md', '---\nname: test\ntype: context\n---\ncontent');

    const llm = mockLlm('I cannot do that.');
    const result = await distill(dir, llm, { force: true });
    expect(result.consolidated).toBe(false);
    expect(result.reason).toBe('no changes needed');
  });
});
