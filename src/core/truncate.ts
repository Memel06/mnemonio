import type { EntrypointTruncation } from '../types.js';

const DEFAULT_MAX_LINES = 200;
const DEFAULT_MAX_BYTES = 25_000;

export function truncateEntrypointContent(
  content: string,
  maxLines: number = DEFAULT_MAX_LINES,
  maxBytes: number = DEFAULT_MAX_BYTES,
): EntrypointTruncation {
  const lines = content.split('\n');
  const originalLines = lines.length;
  const originalBytes = Buffer.byteLength(content, 'utf-8');

  if (originalLines <= maxLines && originalBytes <= maxBytes) {
    return {
      content,
      wasTruncated: false,
      originalLines,
      keptLines: originalLines,
      originalBytes,
      keptBytes: originalBytes,
    };
  }

  let keptLines = 0;
  let keptBytes = 0;
  const kept: string[] = [];

  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line, 'utf-8') + 1;
    if (keptLines >= maxLines || keptBytes + lineBytes > maxBytes) break;
    kept.push(line);
    keptLines++;
    keptBytes += lineBytes;
  }

  const truncated = kept.join('\n');
  return {
    content: truncated,
    wasTruncated: true,
    originalLines,
    keptLines,
    originalBytes,
    keptBytes: Buffer.byteLength(truncated, 'utf-8'),
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
