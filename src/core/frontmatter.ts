import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { MemoryFrontmatter, MemoryType } from '../types.js';
import { parseMemoryType } from './memoryTypes.js';

interface ParsedFile {
  readonly frontmatter: MemoryFrontmatter;
  readonly body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontmatter(raw: string): ParsedFile {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const [, yamlBlock, body] = match;
  if (!yamlBlock) {
    return { frontmatter: {}, body: body ?? raw };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(yamlBlock) as Record<string, unknown>;
  } catch {
    return { frontmatter: {}, body: raw };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { frontmatter: {}, body: body ?? raw };
  }

  const name =
    typeof parsed['name'] === 'string' ? parsed['name'] : undefined;
  const description =
    typeof parsed['description'] === 'string'
      ? parsed['description']
      : undefined;
  const rawType =
    typeof parsed['type'] === 'string' ? parsed['type'] : undefined;
  const type: MemoryType | undefined = rawType
    ? parseMemoryType(rawType)
    : undefined;
  const tags = Array.isArray(parsed['tags'])
    ? (parsed['tags'].filter((t): t is string => typeof t === 'string'))
    : undefined;
  const expires =
    typeof parsed['expires'] === 'string' ? parsed['expires'] : undefined;

  return {
    frontmatter: { name, description, type, tags, expires },
    body: body ?? '',
  };
}

export function buildFrontmatter(fm: MemoryFrontmatter): string {
  const obj: Record<string, unknown> = {};
  if (fm.name !== undefined) obj['name'] = fm.name;
  if (fm.description !== undefined) obj['description'] = fm.description;
  if (fm.type !== undefined) obj['type'] = fm.type;
  if (fm.tags !== undefined && fm.tags.length > 0) obj['tags'] = [...fm.tags];
  if (fm.expires !== undefined) obj['expires'] = fm.expires;

  const yaml = stringifyYaml(obj, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---`;
}
