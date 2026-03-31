import type { MemoryType } from '../types.js';

export const MEMORY_TYPES: ReadonlyArray<MemoryType> = [
  'identity',
  'directive',
  'context',
  'bookmark',
] as const;

interface MemoryTypeDefinition {
  readonly name: MemoryType;
  readonly description: string;
  readonly whenToSave: string;
  readonly howToUse: string;
  readonly bodyStructure?: string;
  readonly examples: string;
}

const TYPE_DEFINITIONS: ReadonlyArray<MemoryTypeDefinition> = [
  {
    name: 'identity',
    description:
      "Who the user is -- role, goals, responsibilities, expertise, and working style.",
    whenToSave:
      "When you learn details about the user's background, preferences, expertise, or working context.",
    howToUse: "Adapt your tone, depth, and framing to the user's profile.",
    examples: [
      "user: I'm a data scientist investigating logging",
      'assistant: [saves identity memory: data scientist, focused on observability]',
    ].join('\n'),
  },
  {
    name: 'directive',
    description:
      "Behavioral guidance from the user -- corrections, confirmed approaches, and standing instructions.",
    whenToSave:
      'When the user corrects your approach OR confirms a non-obvious choice worked well.',
    howToUse:
      "Follow these so the user doesn't repeat themselves.",
    bodyStructure:
      'State the rule, then add `> reason:` and `> scope:` lines for context.',
    examples: [
      "user: don't mock the database in tests",
      'assistant: [saves directive: integration tests must hit real DB. reason: prior incident with mock/prod divergence]',
    ].join('\n'),
  },
  {
    name: 'context',
    description:
      'Ongoing work, decisions, timelines, incidents, and project state not derivable from code.',
    whenToSave:
      'When you learn who is doing what, why, or by when. Convert relative dates to absolute.',
    howToUse:
      "Understand the broader situation behind the user's request.",
    bodyStructure:
      'State the fact or decision, then add `> reason:` and `> scope:` lines.',
    examples: [
      "user: we're freezing merges after Thursday for mobile release",
      'assistant: [saves context: merge freeze begins 2026-03-05 for mobile release cut]',
    ].join('\n'),
  },
  {
    name: 'bookmark',
    description:
      'Pointers to where information lives in external systems -- dashboards, docs, trackers, channels.',
    whenToSave:
      'When you learn about resources in external systems and their purpose.',
    howToUse:
      'When the user references an external system or asks where something lives.',
    examples: [
      'user: bugs are tracked in Linear project "INGEST"',
      'assistant: [saves bookmark: pipeline bugs tracked in Linear project "INGEST"]',
    ].join('\n'),
  },
];

export function getTypeDefinition(
  type: MemoryType,
): MemoryTypeDefinition | undefined {
  return TYPE_DEFINITIONS.find((t) => t.name === type);
}

export function getTypeDefinitions(): ReadonlyArray<MemoryTypeDefinition> {
  return TYPE_DEFINITIONS;
}

export function parseMemoryType(value: string): MemoryType | undefined {
  const lower = value.toLowerCase().trim();
  if (MEMORY_TYPES.includes(lower as MemoryType)) {
    return lower as MemoryType;
  }
  return undefined;
}

export function buildTypePromptSection(): string {
  const rows = TYPE_DEFINITIONS.map((t) => {
    const parts = [
      `### ${t.name}`,
      '',
      t.description,
      '',
      `**Save when:** ${t.whenToSave}`,
      `**Use for:** ${t.howToUse}`,
    ];
    if (t.bodyStructure) {
      parts.push(`**Body format:** ${t.bodyStructure}`);
    }
    parts.push('', '```', t.examples, '```');
    return parts.join('\n');
  });

  return rows.join('\n\n');
}
