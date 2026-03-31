import { resolve, join, relative, isAbsolute } from 'node:path';
import { access, constants } from 'node:fs/promises';

const DEFAULT_ENTRYPOINT = 'MANIFEST.md';

export interface ResolvedPaths {
  readonly memoryDir: string;
  readonly entrypoint: string;
}

export function resolvePaths(
  memoryDir: string,
  entrypointName?: string,
): ResolvedPaths {
  const resolved = resolve(memoryDir);
  const entrypoint = join(resolved, entrypointName ?? DEFAULT_ENTRYPOINT);
  return { memoryDir: resolved, entrypoint };
}

export function isInsideDir(dir: string, filePath: string): boolean {
  const rel = relative(dir, resolve(filePath));
  return !rel.startsWith('..') && !isAbsolute(rel);
}

export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

export function memoryFilePath(memoryDir: string, filename: string): string {
  const sanitized = sanitizeFilename(filename);
  const withExt = sanitized.endsWith('.md') ? sanitized : `${sanitized}.md`;
  return join(resolve(memoryDir), withExt);
}
