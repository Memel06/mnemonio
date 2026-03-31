import type { MemoryHeader } from '../types.js';
import { formatMemoryManifest } from '../core/scan.js';

export interface ConsolidationPromptConfig {
  readonly memoryDir: string;
  readonly headers: ReadonlyArray<MemoryHeader>;
  readonly memoryContents: ReadonlyArray<{ readonly filename: string; readonly content: string }>;
}

export function buildConsolidationSystemPrompt(): string {
  return [
    'You are a memory consolidation agent. Review stored memories and improve their organization.',
    '',
    '## Objectives',
    '',
    '1. **Merge overlapping memories** into a single file when they cover the same topic',
    '2. **Update stale entries** that contradict newer information',
    '3. **Remove obsolete entries** that are no longer relevant',
    '4. **Sharpen descriptions** so each file has a clear, specific frontmatter summary',
    '5. **Correct categories** (identity/directive/context/bookmark)',
    '6. **Tighten prose** -- cut filler, keep only actionable or informative content',
    '7. **Flag expired memories** whose `expires` date has passed',
    '',
    '## Constraints',
    '',
    '- Do NOT remove memories that are still relevant',
    '- Do NOT invent new information -- only reorganize what exists',
    '- Preserve `> reason:` and `> scope:` context in directive and context memories',
    '- Manifest entries should be concise one-liners',
    '',
    '## Response Format',
    '',
    'Return JSON:',
    '',
    '```json',
    '{',
    '  "updates": [',
    '    {',
    '      "action": "update" | "remove" | "merge",',
    '      "filename": "existing_file.md",',
    '      "mergeInto": "target_file.md",',
    '      "newContent": "full file content with frontmatter",',
    '      "reason": "why this change"',
    '    }',
    '  ],',
    '  "newManifest": "full replacement content for MANIFEST.md"',
    '}',
    '```',
    '',
    'If no changes needed: `{ "updates": [], "newManifest": null }`',
  ].join('\n');
}

export function buildConsolidationUserPrompt(config: ConsolidationPromptConfig): string {
  const manifest = formatMemoryManifest(config.headers, config.memoryDir);

  const fileContents = config.memoryContents
    .map(f => `### ${f.filename}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  return [
    '## Current Manifest',
    '',
    manifest,
    '',
    '## File Contents',
    '',
    fileContents,
    '',
    'Review these memories and propose consolidation changes.',
  ].join('\n');
}
