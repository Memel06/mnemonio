import { describe, it, expect } from 'vitest';
import { parseFrontmatter, buildFrontmatter } from './frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter with all fields', () => {
    const input = [
      '---',
      'name: testing',
      'description: A test memory',
      'type: directive',
      'tags:',
      '  - ci',
      '  - testing',
      'expires: "2026-06-01"',
      '---',
      '',
      'Body content here.',
    ].join('\n');

    const result = parseFrontmatter(input);
    expect(result.frontmatter.name).toBe('testing');
    expect(result.frontmatter.description).toBe('A test memory');
    expect(result.frontmatter.type).toBe('directive');
    expect(result.frontmatter.tags).toEqual(['ci', 'testing']);
    expect(result.frontmatter.expires).toBe('2026-06-01');
    expect(result.body.trim()).toBe('Body content here.');
  });

  it('returns empty frontmatter for plain text', () => {
    const result = parseFrontmatter('Just some plain text.');
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('Just some plain text.');
  });

  it('handles empty frontmatter block', () => {
    const input = '---\n\n---\nBody.';
    const result = parseFrontmatter(input);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('Body.');
  });

  it('handles invalid YAML gracefully', () => {
    const input = '---\n: : : broken\n---\nBody.';
    const result = parseFrontmatter(input);
    expect(result.body).toBe('---\n: : : broken\n---\nBody.');
  });

  it('rejects invalid memory types', () => {
    const input = '---\ntype: banana\n---\nBody.';
    const result = parseFrontmatter(input);
    expect(result.frontmatter.type).toBeUndefined();
  });

  it('accepts all valid memory types', () => {
    for (const type of ['identity', 'directive', 'context', 'bookmark']) {
      const input = `---\ntype: ${type}\n---\nBody.`;
      const result = parseFrontmatter(input);
      expect(result.frontmatter.type).toBe(type);
    }
  });

  it('handles Windows-style line endings', () => {
    const input = '---\r\nname: win\r\n---\r\nBody.';
    const result = parseFrontmatter(input);
    expect(result.frontmatter.name).toBe('win');
    expect(result.body).toBe('Body.');
  });

  it('ignores non-string name/description/type fields', () => {
    const input = '---\nname: 123\ndescription: true\n---\nBody.';
    const result = parseFrontmatter(input);
    expect(result.frontmatter.name).toBeUndefined();
    expect(result.frontmatter.description).toBeUndefined();
  });

  it('filters non-string tags', () => {
    const input = '---\ntags:\n  - valid\n  - 42\n---\nBody.';
    const result = parseFrontmatter(input);
    expect(result.frontmatter.tags).toEqual(['valid']);
  });
});

describe('buildFrontmatter', () => {
  it('builds complete frontmatter', () => {
    const result = buildFrontmatter({
      name: 'test',
      description: 'A description',
      type: 'directive',
    });
    expect(result).toContain('---');
    expect(result).toContain('name: test');
    expect(result).toContain('description: A description');
    expect(result).toContain('type: directive');
  });

  it('omits undefined fields', () => {
    const result = buildFrontmatter({ name: 'only-name' });
    expect(result).toContain('name: only-name');
    expect(result).not.toContain('description');
    expect(result).not.toContain('type');
  });

  it('builds empty frontmatter', () => {
    const result = buildFrontmatter({});
    expect(result).toBe('---\n{}\n---');
  });

  it('properly escapes YAML special characters', () => {
    const result = buildFrontmatter({
      description: 'value: with colons and {braces}',
    });
    // The yaml library should quote the value
    expect(result).toContain('description:');
    // Re-parse to verify round-trip
    const parsed = parseFrontmatter(result + '\n\nBody.');
    expect(parsed.frontmatter.description).toBe(
      'value: with colons and {braces}',
    );
  });

  it('includes tags as a YAML array', () => {
    const result = buildFrontmatter({
      name: 'tagged',
      tags: ['ci', 'testing'],
    });
    expect(result).toContain('tags:');
    const parsed = parseFrontmatter(result + '\n\nBody.');
    expect(parsed.frontmatter.tags).toEqual(['ci', 'testing']);
  });

  it('includes expires field', () => {
    const result = buildFrontmatter({
      name: 'expiring',
      expires: '2026-06-01',
    });
    expect(result).toContain('expires:');
    const parsed = parseFrontmatter(result + '\n\nBody.');
    expect(parsed.frontmatter.expires).toBe('2026-06-01');
  });
});
