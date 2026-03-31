import { describe, it, expect } from 'vitest';
import { truncateEntrypointContent, formatFileSize } from './truncate.js';

describe('truncateEntrypointContent', () => {
  it('returns content unchanged when within limits', () => {
    const content = 'line 1\nline 2\nline 3';
    const result = truncateEntrypointContent(content, 200, 25_000);
    expect(result.wasTruncated).toBe(false);
    expect(result.content).toBe(content);
    expect(result.keptLines).toBe(3);
  });

  it('truncates by line count', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const content = lines.join('\n');
    const result = truncateEntrypointContent(content, 3, 100_000);
    expect(result.wasTruncated).toBe(true);
    expect(result.keptLines).toBe(3);
    expect(result.originalLines).toBe(10);
  });

  it('truncates by byte count', () => {
    const content = 'x'.repeat(100);
    const result = truncateEntrypointContent(content, 1000, 50);
    expect(result.wasTruncated).toBe(true);
    expect(result.keptBytes).toBeLessThanOrEqual(50);
  });

  it('handles empty content', () => {
    const result = truncateEntrypointContent('', 200, 25_000);
    expect(result.wasTruncated).toBe(false);
    expect(result.content).toBe('');
    expect(result.originalLines).toBe(1);
  });

  it('handles single line within limits', () => {
    const result = truncateEntrypointContent('hello', 200, 25_000);
    expect(result.wasTruncated).toBe(false);
    expect(result.keptLines).toBe(1);
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0MB');
  });

  it('formats zero', () => {
    expect(formatFileSize(0)).toBe('0B');
  });
});
