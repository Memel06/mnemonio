/**
 * Shared utility for parsing JSON from LLM responses.
 * LLMs often wrap JSON in markdown code fences or include preamble text.
 */

const CODE_BLOCK_RE = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;
const RAW_JSON_RE = /(\{[\s\S]*\})/;

export function parseLlmJson<T>(
  raw: string,
  validate: (value: unknown) => value is T,
): T | null {
  const jsonStr = extractJsonString(raw);
  if (!jsonStr) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  if (!validate(parsed)) return null;
  return parsed;
}

function extractJsonString(raw: string): string | null {
  const codeBlock = CODE_BLOCK_RE.exec(raw);
  if (codeBlock?.[1]) return codeBlock[1];

  const rawJson = RAW_JSON_RE.exec(raw);
  if (rawJson?.[1]) return rawJson[1];

  return null;
}

// -- Type guards for LLM response shapes --

interface RelevanceMatch {
  readonly filename: string;
  readonly reason: string;
  readonly score: number;
}

interface RelevanceResult {
  readonly matches: ReadonlyArray<RelevanceMatch>;
}

export function isRelevanceResult(v: unknown): v is RelevanceResult {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (!Array.isArray(obj['matches'])) return false;
  return obj['matches'].every(
    (m: unknown) =>
      typeof m === 'object' &&
      m !== null &&
      typeof (m as Record<string, unknown>)['filename'] === 'string' &&
      typeof (m as Record<string, unknown>)['score'] === 'number',
  );
}

interface ExtractionMemory {
  readonly action: string;
  readonly filename: string;
  readonly frontmatter: {
    readonly name: string;
    readonly description: string;
    readonly type: string;
    readonly tags?: ReadonlyArray<string>;
    readonly expires?: string;
  };
  readonly body: string;
}

interface ExtractionResult {
  readonly memories: ReadonlyArray<ExtractionMemory>;
  readonly manifestEntries: ReadonlyArray<string>;
}

export function isExtractionResult(v: unknown): v is ExtractionResult {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (!Array.isArray(obj['memories'])) return false;
  return obj['memories'].every((m: unknown) => {
    if (typeof m !== 'object' || m === null) return false;
    const mem = m as Record<string, unknown>;
    return (
      typeof mem['filename'] === 'string' &&
      typeof mem['body'] === 'string' &&
      typeof mem['frontmatter'] === 'object' &&
      mem['frontmatter'] !== null
    );
  });
}

interface ConsolidationUpdate {
  readonly action: string;
  readonly filename: string;
  readonly mergeInto?: string;
  readonly newContent?: string;
  readonly reason: string;
}

interface ConsolidationResult {
  readonly updates: ReadonlyArray<ConsolidationUpdate>;
  readonly newManifest: string | null;
}

export function isConsolidationResult(v: unknown): v is ConsolidationResult {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (!Array.isArray(obj['updates'])) return false;
  const manifest = obj['newManifest'];
  if (manifest !== null && manifest !== undefined && typeof manifest !== 'string') return false;
  return obj['updates'].every((u: unknown) => {
    if (typeof u !== 'object' || u === null) return false;
    const upd = u as Record<string, unknown>;
    return (
      typeof upd['action'] === 'string' &&
      typeof upd['filename'] === 'string' &&
      typeof upd['reason'] === 'string'
    );
  });
}

export type { RelevanceResult, RelevanceMatch, ExtractionResult, ExtractionMemory, ConsolidationResult, ConsolidationUpdate };
