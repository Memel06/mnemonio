import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { LlmCallback } from './types.js';
import { extractMemories } from './extract.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mnemonio-extract-'));
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

describe('extractMemories', () => {
  it('skips when no messages provided', async () => {
    const llm = mockLlm('');
    const result = await extractMemories(dir, llm, { messages: [] });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no messages');
  });

  it('skips when LLM returns empty memories', async () => {
    const llm = mockLlm('```json\n{"memories": [], "manifestEntries": []}\n```');
    const result = await extractMemories(dir, llm, {
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(result.skipped).toBe(true);
  });

  it('creates memory files from LLM response', async () => {
    const response = JSON.stringify({
      memories: [
        {
          action: 'create',
          filename: 'identity_role.md',
          frontmatter: {
            name: 'role',
            description: 'Data scientist',
            type: 'identity',
          },
          body: 'User is a data scientist.',
        },
      ],
      manifestEntries: [
        '- [Role](identity_role.md) -- data scientist',
      ],
    });
    const llm = mockLlm(`\`\`\`json\n${response}\n\`\`\``);

    const result = await extractMemories(dir, llm, {
      messages: [
        { role: 'user', content: "I'm a data scientist" },
        { role: 'assistant', content: 'Noted.' },
      ],
    });

    expect(result.skipped).toBe(false);
    expect(result.filesWritten).toContain('identity_role.md');

    const content = await readFile(join(dir, 'identity_role.md'), 'utf-8');
    expect(content).toContain('name: role');
    expect(content).toContain('type: identity');
    expect(content).toContain('User is a data scientist.');
  });

  it('appends manifest entries', async () => {
    const response = JSON.stringify({
      memories: [
        {
          action: 'create',
          filename: 'test.md',
          frontmatter: { name: 'test', description: 'test', type: 'context' },
          body: 'content',
        },
      ],
      manifestEntries: ['- [Test](test.md) -- test entry'],
    });
    const llm = mockLlm(response);

    await extractMemories(dir, llm, {
      messages: [{ role: 'user', content: 'test' }],
    });

    const manifest = await readFile(join(dir, 'MANIFEST.md'), 'utf-8');
    expect(manifest).toContain('- [Test](test.md) -- test entry');
  });

  it('blocks path traversal in filenames', async () => {
    const response = JSON.stringify({
      memories: [
        {
          action: 'create',
          filename: '../../../etc/evil.md',
          frontmatter: { name: 'evil', description: 'bad', type: 'context' },
          body: 'should not be written',
        },
        {
          action: 'create',
          filename: 'safe.md',
          frontmatter: { name: 'safe', description: 'good', type: 'context' },
          body: 'should be written',
        },
      ],
      manifestEntries: [],
    });
    const llm = mockLlm(response);

    const result = await extractMemories(dir, llm, {
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result.filesWritten).toContain('safe.md');
    expect(result.filesWritten).not.toContain('../../../etc/evil.md');

    const files = await readdir(dir);
    expect(files).toContain('safe.md');
  });

  it('handles LLM returning invalid JSON', async () => {
    const llm = mockLlm('I could not parse that conversation.');
    const result = await extractMemories(dir, llm, {
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(result.skipped).toBe(true);
  });

  it('skips memories with empty filename or body', async () => {
    const response = JSON.stringify({
      memories: [
        {
          action: 'create',
          filename: '',
          frontmatter: { name: '', description: '', type: 'context' },
          body: 'content',
        },
        {
          action: 'create',
          filename: 'valid.md',
          frontmatter: { name: 'v', description: 'd', type: 'context' },
          body: '',
        },
      ],
      manifestEntries: [],
    });
    const llm = mockLlm(response);

    const result = await extractMemories(dir, llm, {
      messages: [{ role: 'user', content: 'test' }],
    });

    // Both should be skipped (empty filename, empty body)
    expect(result.filesWritten).toHaveLength(0);
  });
});
