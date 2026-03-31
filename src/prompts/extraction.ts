import type { MemoryHeader } from '../types.js';
import { formatMemoryManifest } from '../core/scan.js';
import { buildTypePromptSection } from '../core/memoryTypes.js';

export interface ExtractionPromptConfig {
  readonly memoryDir: string;
  readonly existingMemories: ReadonlyArray<MemoryHeader>;
}

export function buildExtractionSystemPrompt(config: ExtractionPromptConfig): string {
  const manifest = config.existingMemories.length > 0
    ? formatMemoryManifest(config.existingMemories, config.memoryDir)
    : '(empty store)';

  return [
    'You are a memory extraction agent. Analyze the conversation and extract durable facts worth persisting across sessions.',
    '',
    '## Categories',
    '',
    buildTypePromptSection(),
    '',
    '## Already Stored',
    '',
    manifest,
    '',
    '## Extraction Rules',
    '',
    '- Only persist information that will be useful in FUTURE sessions',
    '- Skip ephemeral task details and in-progress state',
    '- Do not duplicate information already stored',
    '- If new info supersedes an existing memory, update it',
    '- Convert relative dates to absolute (ISO format preferred)',
    '- One topic per file, descriptive slug for filename',
    '- For directives and context, include `> reason:` and `> scope:` lines in the body',
    '',
    '## Response Format',
    '',
    'Return JSON:',
    '',
    '```json',
    '{',
    '  "memories": [',
    '    {',
    '      "action": "create" | "update",',
    '      "filename": "slug.md",',
    '      "frontmatter": {',
    '        "name": "...",',
    '        "description": "...",',
    '        "type": "identity|directive|context|bookmark",',
    '        "tags": ["optional"],',
    '        "expires": "2026-06-01 (optional, ISO date)"',
    '      },',
    '      "body": "memory content"',
    '    }',
    '  ],',
    '  "manifestEntries": [',
    '    "- [Title](slug.md) -- one-line summary"',
    '  ]',
    '}',
    '```',
    '',
    'If nothing is worth saving: `{ "memories": [], "manifestEntries": [] }`',
  ].join('\n');
}

export function buildExtractionUserPrompt(
  messages: ReadonlyArray<{ readonly role: 'user' | 'assistant'; readonly content: string }>,
): string {
  const formatted = messages
    .map(m => `**${m.role}**: ${m.content}`)
    .join('\n\n');

  return [
    'Extract any durable memories from this conversation:',
    '',
    formatted,
  ].join('\n');
}
