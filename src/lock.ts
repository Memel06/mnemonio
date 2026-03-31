import {
  open,
  readFile,
  writeFile,
  stat,
  utimes,
  unlink,
} from 'node:fs/promises';
import { join } from 'node:path';

const LOCK_FILE = '.mnemonio.lock';
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

interface LockInfo {
  readonly pid: number;
  readonly acquiredAt: number;
}

function lockPath(memoryDir: string): string {
  return join(memoryDir, LOCK_FILE);
}

export async function tryAcquireLock(
  memoryDir: string,
): Promise<number | null> {
  const path = lockPath(memoryDir);

  // Check for existing lock
  try {
    const content = await readFile(path, 'utf-8');
    const info = JSON.parse(content) as LockInfo;

    if (isProcessRunning(info.pid)) {
      const lockAge = Date.now() - info.acquiredAt;
      if (lockAge < LOCK_TIMEOUT_MS) return null;
    }

    // Stale lock or dead process -- remove it before trying exclusive create
    await unlink(path);
  } catch {
    // No lock file or unreadable -- proceed to acquire
  }

  // Atomic exclusive create -- fails if another process created the file first
  const info: LockInfo = { pid: process.pid, acquiredAt: Date.now() };
  try {
    const handle = await open(path, 'wx');
    await handle.writeFile(JSON.stringify(info), 'utf-8');
    await handle.close();
  } catch (err) {
    if (isNodeError(err) && err.code === 'EEXIST') return null;
    return null;
  }

  return info.acquiredAt;
}

export async function releaseLock(memoryDir: string): Promise<void> {
  const path = lockPath(memoryDir);
  try {
    const content = await readFile(path, 'utf-8');
    const info = JSON.parse(content) as LockInfo;
    if (info.pid === process.pid) {
      await unlink(path);
    }
  } catch {
    // Lock file doesn't exist or isn't ours
  }
}

export async function readLastDistilledAt(memoryDir: string): Promise<number> {
  const markerPath = join(memoryDir, '.last-distilled');
  try {
    const s = await stat(markerPath);
    return s.mtimeMs;
  } catch {
    return 0;
  }
}

export async function touchLastDistilled(memoryDir: string): Promise<void> {
  const markerPath = join(memoryDir, '.last-distilled');
  const now = new Date();
  try {
    await writeFile(markerPath, now.toISOString(), 'utf-8');
  } catch {
    // Best effort
  }
}

export async function rollbackLock(
  memoryDir: string,
  priorMtime: number,
): Promise<void> {
  const path = lockPath(memoryDir);
  try {
    const date = new Date(priorMtime);
    await utimes(path, date, date);
  } catch {
    // Best effort
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
