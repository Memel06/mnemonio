import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  tryAcquireLock,
  releaseLock,
  readLastDistilledAt,
  touchLastDistilled,
} from './lock.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mnemonio-lock-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('tryAcquireLock', () => {
  it('acquires lock on empty directory', async () => {
    const result = await tryAcquireLock(dir);
    expect(result).toBeTypeOf('number');
    expect(result).toBeGreaterThan(0);
  });

  it('creates lock file with pid', async () => {
    await tryAcquireLock(dir);
    const content = await readFile(join(dir, '.mnemonio.lock'), 'utf-8');
    const info = JSON.parse(content);
    expect(info.pid).toBe(process.pid);
    expect(info.acquiredAt).toBeTypeOf('number');
  });

  it('fails to acquire when lock is held by current process', async () => {
    await tryAcquireLock(dir);
    const second = await tryAcquireLock(dir);
    expect(second).toBeNull();
  });
});

describe('releaseLock', () => {
  it('removes lock owned by current process', async () => {
    await tryAcquireLock(dir);
    await releaseLock(dir);
    const result = await tryAcquireLock(dir);
    expect(result).toBeTypeOf('number');
  });

  it('no-ops when no lock exists', async () => {
    // Should not throw
    await releaseLock(dir);
  });
});

describe('readLastDistilledAt', () => {
  it('returns 0 when no marker exists', async () => {
    const result = await readLastDistilledAt(dir);
    expect(result).toBe(0);
  });

  it('returns timestamp after touch', async () => {
    const before = Date.now();
    await touchLastDistilled(dir);
    const result = await readLastDistilledAt(dir);
    expect(result).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('touchLastDistilled', () => {
  it('creates marker file', async () => {
    await touchLastDistilled(dir);
    const content = await readFile(join(dir, '.last-distilled'), 'utf-8');
    expect(content).toBeTruthy();
    // Should be a valid ISO date
    expect(() => new Date(content)).not.toThrow();
  });
});
