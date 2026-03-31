import { describe, it, expect } from 'vitest';
import {
  MEMORY_TYPES,
  parseMemoryType,
  getTypeDefinition,
  getTypeDefinitions,
  buildTypePromptSection,
} from './memoryTypes.js';

describe('MEMORY_TYPES', () => {
  it('has exactly four types', () => {
    expect(MEMORY_TYPES).toHaveLength(4);
  });

  it('contains the expected types', () => {
    expect(MEMORY_TYPES).toEqual([
      'identity',
      'directive',
      'context',
      'bookmark',
    ]);
  });
});

describe('parseMemoryType', () => {
  it('parses valid types', () => {
    expect(parseMemoryType('identity')).toBe('identity');
    expect(parseMemoryType('directive')).toBe('directive');
    expect(parseMemoryType('context')).toBe('context');
    expect(parseMemoryType('bookmark')).toBe('bookmark');
  });

  it('is case-insensitive', () => {
    expect(parseMemoryType('IDENTITY')).toBe('identity');
    expect(parseMemoryType('Directive')).toBe('directive');
  });

  it('trims whitespace', () => {
    expect(parseMemoryType('  context  ')).toBe('context');
  });

  it('returns undefined for invalid types', () => {
    expect(parseMemoryType('user')).toBeUndefined();
    expect(parseMemoryType('feedback')).toBeUndefined();
    expect(parseMemoryType('banana')).toBeUndefined();
    expect(parseMemoryType('')).toBeUndefined();
  });
});

describe('getTypeDefinition', () => {
  it('returns definition for valid type', () => {
    const def = getTypeDefinition('directive');
    expect(def).toBeDefined();
    expect(def!.name).toBe('directive');
    expect(def!.description).toBeTruthy();
    expect(def!.whenToSave).toBeTruthy();
    expect(def!.howToUse).toBeTruthy();
  });

  it('returns undefined for invalid type', () => {
    // @ts-expect-error testing invalid input
    expect(getTypeDefinition('invalid')).toBeUndefined();
  });
});

describe('getTypeDefinitions', () => {
  it('returns all four definitions', () => {
    const defs = getTypeDefinitions();
    expect(defs).toHaveLength(4);
  });
});

describe('buildTypePromptSection', () => {
  it('produces markdown output', () => {
    const section = buildTypePromptSection();
    expect(section).toContain('### identity');
    expect(section).toContain('### directive');
    expect(section).toContain('### context');
    expect(section).toContain('### bookmark');
    expect(section).toContain('**Save when:**');
    expect(section).toContain('**Use for:**');
  });

  it('includes body format for directive and context', () => {
    const section = buildTypePromptSection();
    expect(section).toContain('**Body format:**');
  });
});
