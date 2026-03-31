import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  resolvePaths,
  isInsideDir,
  sanitizeFilename,
  memoryFilePath,
} from './paths.js';

describe('resolvePaths', () => {
  it('resolves relative memoryDir to absolute', () => {
    const result = resolvePaths('./memories');
    expect(result.memoryDir).toBe(resolve('./memories'));
  });

  it('defaults entrypoint to MANIFEST.md', () => {
    const result = resolvePaths('/tmp/mem');
    expect(result.entrypoint).toBe('/tmp/mem/MANIFEST.md');
  });

  it('uses custom entrypoint name', () => {
    const result = resolvePaths('/tmp/mem', 'CUSTOM.md');
    expect(result.entrypoint).toBe('/tmp/mem/CUSTOM.md');
  });
});

describe('isInsideDir', () => {
  it('returns true for file inside directory', () => {
    expect(isInsideDir('/a/b', '/a/b/c.md')).toBe(true);
  });

  it('returns true for file in subdirectory', () => {
    expect(isInsideDir('/a/b', '/a/b/sub/c.md')).toBe(true);
  });

  it('returns false for file outside directory', () => {
    expect(isInsideDir('/a/b', '/a/c.md')).toBe(false);
  });

  it('returns false for parent traversal', () => {
    expect(isInsideDir('/a/b', '/a/b/../c.md')).toBe(false);
  });

  it('returns true for the directory itself', () => {
    expect(isInsideDir('/a/b', '/a/b')).toBe(true);
  });
});

describe('sanitizeFilename', () => {
  it('lowercases input', () => {
    expect(sanitizeFilename('Hello')).toBe('hello');
  });

  it('replaces special characters with underscores', () => {
    expect(sanitizeFilename('my file!@#.md')).toBe('my_file_md');
  });

  it('collapses consecutive underscores', () => {
    expect(sanitizeFilename('a___b')).toBe('a_b');
  });

  it('strips leading and trailing underscores', () => {
    expect(sanitizeFilename('_hello_')).toBe('hello');
  });

  it('truncates to 80 characters', () => {
    const long = 'a'.repeat(100);
    expect(sanitizeFilename(long).length).toBe(80);
  });

  it('preserves hyphens and underscores', () => {
    expect(sanitizeFilename('my-memory_file')).toBe('my-memory_file');
  });
});

describe('memoryFilePath', () => {
  it('builds path with sanitized name', () => {
    const result = memoryFilePath('/tmp/mem', 'My Memory');
    expect(result).toBe(resolve('/tmp/mem', 'my_memory.md'));
  });

  it('sanitizes .md in the name and adds .md extension', () => {
    // sanitizeFilename replaces '.' with '_', so 'test.md' -> 'test_md'
    const result = memoryFilePath('/tmp/mem', 'test.md');
    expect(result).toContain('test_md.md');
  });
});
