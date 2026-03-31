import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateTeamPath, isTeamPath, PathTraversalError } from './teamPaths.js';

let teamDir: string;

beforeEach(async () => {
  teamDir = await mkdtemp(join(tmpdir(), 'mnemonio-team-'));
});

afterEach(async () => {
  await rm(teamDir, { recursive: true, force: true });
});

describe('validateTeamPath', () => {
  it('accepts a simple filename', async () => {
    const result = await validateTeamPath(teamDir, 'notes.md');
    expect(result).toContain('notes.md');
  });

  it('accepts a subdirectory path', async () => {
    await mkdir(join(teamDir, 'sub'));
    await writeFile(join(teamDir, 'sub', 'file.md'), 'content');
    const result = await validateTeamPath(teamDir, 'sub/file.md');
    expect(result).toContain('sub');
    expect(result).toContain('file.md');
  });

  it('rejects parent directory traversal', async () => {
    await expect(
      validateTeamPath(teamDir, '../escape.md'),
    ).rejects.toThrow(PathTraversalError);
  });

  it('rejects deeply nested traversal', async () => {
    await expect(
      validateTeamPath(teamDir, 'a/b/../../../../../../etc/passwd'),
    ).rejects.toThrow(PathTraversalError);
  });

  it('rejects null bytes', async () => {
    await expect(
      validateTeamPath(teamDir, 'file\0.md'),
    ).rejects.toThrow(PathTraversalError);
  });

  it('rejects symlinks pointing outside', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'mnemonio-outside-'));
    await writeFile(join(outsideDir, 'secret.md'), 'secret');
    await symlink(
      join(outsideDir, 'secret.md'),
      join(teamDir, 'escape.md'),
    );

    await expect(
      validateTeamPath(teamDir, 'escape.md'),
    ).rejects.toThrow(PathTraversalError);

    await rm(outsideDir, { recursive: true, force: true });
  });

  it('allows symlinks inside teamDir', async () => {
    await writeFile(join(teamDir, 'real.md'), 'content');
    await symlink(join(teamDir, 'real.md'), join(teamDir, 'link.md'));
    const result = await validateTeamPath(teamDir, 'link.md');
    expect(result).toContain(teamDir);
  });
});

describe('isTeamPath', () => {
  it('returns true for path inside teamDir', () => {
    expect(isTeamPath(teamDir, join(teamDir, 'file.md'))).toBe(true);
  });

  it('returns false for path outside teamDir', () => {
    expect(isTeamPath(teamDir, '/tmp/other/file.md')).toBe(false);
  });

  it('returns false for parent traversal', () => {
    expect(isTeamPath(teamDir, join(teamDir, '..', 'escape.md'))).toBe(false);
  });
});
