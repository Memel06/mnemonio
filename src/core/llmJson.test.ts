import { describe, it, expect } from 'vitest';
import {
  parseLlmJson,
  isRelevanceResult,
  isExtractionResult,
  isConsolidationResult,
} from './llmJson.js';

describe('parseLlmJson', () => {
  it('parses JSON from markdown code block', () => {
    const raw = 'Here is the result:\n```json\n{"matches": []}\n```\nDone.';
    const result = parseLlmJson(raw, isRelevanceResult);
    expect(result).toEqual({ matches: [] });
  });

  it('parses JSON from bare code block', () => {
    const raw = '```\n{"matches": []}\n```';
    const result = parseLlmJson(raw, isRelevanceResult);
    expect(result).toEqual({ matches: [] });
  });

  it('parses raw JSON without code block', () => {
    const raw = '{"matches": []}';
    const result = parseLlmJson(raw, isRelevanceResult);
    expect(result).toEqual({ matches: [] });
  });

  it('returns null for non-JSON', () => {
    const result = parseLlmJson('no json here', isRelevanceResult);
    expect(result).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const result = parseLlmJson('```json\n{broken\n```', isRelevanceResult);
    expect(result).toBeNull();
  });

  it('returns null when validation fails', () => {
    const raw = '{"notMatches": true}';
    const result = parseLlmJson(raw, isRelevanceResult);
    expect(result).toBeNull();
  });
});

describe('isRelevanceResult', () => {
  it('accepts valid result', () => {
    expect(
      isRelevanceResult({
        matches: [{ filename: 'a.md', reason: 'relevant', score: 0.9 }],
      }),
    ).toBe(true);
  });

  it('accepts empty matches', () => {
    expect(isRelevanceResult({ matches: [] })).toBe(true);
  });

  it('rejects missing matches', () => {
    expect(isRelevanceResult({})).toBe(false);
  });

  it('rejects non-array matches', () => {
    expect(isRelevanceResult({ matches: 'nope' })).toBe(false);
  });

  it('rejects matches with missing filename', () => {
    expect(
      isRelevanceResult({ matches: [{ score: 0.5, reason: 'x' }] }),
    ).toBe(false);
  });

  it('rejects matches with non-number score', () => {
    expect(
      isRelevanceResult({
        matches: [{ filename: 'a.md', score: 'high', reason: 'x' }],
      }),
    ).toBe(false);
  });

  it('rejects null', () => {
    expect(isRelevanceResult(null)).toBe(false);
  });
});

describe('isExtractionResult', () => {
  it('accepts valid result', () => {
    expect(
      isExtractionResult({
        memories: [
          {
            action: 'create',
            filename: 'test.md',
            frontmatter: { name: 'test', description: 'desc', type: 'identity' },
            body: 'content',
          },
        ],
        manifestEntries: [],
      }),
    ).toBe(true);
  });

  it('accepts empty memories', () => {
    expect(
      isExtractionResult({ memories: [], manifestEntries: [] }),
    ).toBe(true);
  });

  it('rejects missing memories array', () => {
    expect(isExtractionResult({})).toBe(false);
  });

  it('rejects memories without filename', () => {
    expect(
      isExtractionResult({
        memories: [
          { action: 'create', body: 'x', frontmatter: {} },
        ],
      }),
    ).toBe(false);
  });

  it('rejects memories without body', () => {
    expect(
      isExtractionResult({
        memories: [
          { action: 'create', filename: 'x.md', frontmatter: {} },
        ],
      }),
    ).toBe(false);
  });
});

describe('isConsolidationResult', () => {
  it('accepts valid result', () => {
    expect(
      isConsolidationResult({
        updates: [
          { action: 'update', filename: 'a.md', reason: 'tighten' },
        ],
        newManifest: null,
      }),
    ).toBe(true);
  });

  it('accepts empty updates', () => {
    expect(
      isConsolidationResult({ updates: [], newManifest: null }),
    ).toBe(true);
  });

  it('rejects missing updates array', () => {
    expect(isConsolidationResult({})).toBe(false);
  });

  it('rejects updates without action', () => {
    expect(
      isConsolidationResult({
        updates: [{ filename: 'a.md', reason: 'x' }],
      }),
    ).toBe(false);
  });

  it('rejects updates without filename', () => {
    expect(
      isConsolidationResult({
        updates: [{ action: 'remove', reason: 'x' }],
      }),
    ).toBe(false);
  });

  it('rejects updates without reason', () => {
    expect(
      isConsolidationResult({
        updates: [{ action: 'remove', filename: 'a.md' }],
      }),
    ).toBe(false);
  });
});
