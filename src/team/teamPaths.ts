import { resolve, relative, isAbsolute, normalize } from 'node:path';
import { realpath } from 'node:fs/promises';

export class PathTraversalError extends Error {
  readonly attemptedPath: string;

  constructor(attemptedPath: string, message?: string) {
    super(message ?? `Path traversal blocked: ${attemptedPath}`);
    this.name = 'PathTraversalError';
    this.attemptedPath = attemptedPath;
  }
}

export async function validateTeamPath(
  teamDir: string,
  requestedPath: string,
): Promise<string> {
  const resolvedTeam = resolve(teamDir);
  const resolvedTarget = resolve(resolvedTeam, requestedPath);

  const rel = relative(resolvedTeam, resolvedTarget);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new PathTraversalError(requestedPath, `Path escapes team directory: ${requestedPath}`);
  }

  const normalized = normalize(resolvedTarget);
  const normalizedRel = relative(resolvedTeam, normalized);
  if (normalizedRel.startsWith('..') || isAbsolute(normalizedRel)) {
    throw new PathTraversalError(requestedPath, `Normalized path escapes team directory: ${requestedPath}`);
  }

  if (requestedPath.includes('\0')) {
    throw new PathTraversalError(requestedPath, 'Path contains null bytes');
  }

  // Resolve symlinks if file exists and verify it stays inside team dir
  try {
    const real = await realpath(resolvedTarget);
    // Also resolve teamDir through realpath so both sides use canonical paths
    // (e.g., macOS /var -> /private/var)
    let realTeam: string;
    try {
      realTeam = await realpath(resolvedTeam);
    } catch {
      realTeam = resolvedTeam;
    }
    const realRel = relative(realTeam, real);
    if (realRel.startsWith('..') || isAbsolute(realRel)) {
      throw new PathTraversalError(requestedPath, `Symlink resolves outside team directory: ${requestedPath}`);
    }
    return real;
  } catch (err) {
    if (err instanceof PathTraversalError) throw err;
    // File doesn't exist yet -- check parent was valid
    return resolvedTarget;
  }
}

export function isTeamPath(teamDir: string, filePath: string): boolean {
  const resolvedTeam = resolve(teamDir);
  const resolvedFile = resolve(filePath);
  const rel = relative(resolvedTeam, resolvedFile);
  return !rel.startsWith('..') && !isAbsolute(rel);
}
