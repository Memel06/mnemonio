import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { MemoryHeader } from '../types.js';
import { parseFrontmatter } from './frontmatter.js';
import { memoryFreshnessText } from './memoryAge.js';

export async function scanMemoryFiles(
  memoryDir: string,
  signal?: AbortSignal,
): Promise<ReadonlyArray<MemoryHeader>> {
  let entries: string[];
  try {
    entries = await readdir(memoryDir);
  } catch {
    return [];
  }

  const mdFiles = entries.filter(
    (f) => f.endsWith('.md') && f !== 'MANIFEST.md',
  );
  const headers: MemoryHeader[] = [];

  for (const filename of mdFiles) {
    if (signal?.aborted) break;

    const filePath = join(memoryDir, filename);
    try {
      const [content, fileStat] = await Promise.all([
        readFile(filePath, 'utf-8'),
        stat(filePath),
      ]);

      if (!fileStat.isFile()) continue;

      const { frontmatter } = parseFrontmatter(content);
      headers.push({
        filename,
        filePath,
        mtimeMs: fileStat.mtimeMs,
        description: frontmatter.description ?? null,
        type: frontmatter.type,
      });
    } catch {
      // Skip unreadable files
    }
  }

  return headers.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function formatMemoryManifest(
  headers: ReadonlyArray<MemoryHeader>,
  memoryDir: string,
): string {
  if (headers.length === 0) return '(no memory files)';

  const lines = headers.map((h) => {
    const rel = relative(memoryDir, h.filePath);
    const age = memoryFreshnessText(h.mtimeMs);
    const typeTag = h.type ? `[${h.type}]` : '';
    const desc = h.description ? ` \u2014 ${h.description}` : '';
    return `- ${rel} ${typeTag} (${age})${desc}`;
  });

  return lines.join('\n');
}
