# mnemonio

Persistent structured memory layer for LLM agents. Mnemonio gives your agent a
file-based memory system that survives across sessions -- markdown files with
YAML frontmatter, a manifest file, semantic search, automatic extraction from
conversations, and periodic consolidation.

It ships as both a TypeScript library and a CLI. Two runtime dependencies
(`yaml`, `commander`). LLM operations use a callback you provide, so it works
with any provider.

## Install

```bash
npm install mnemonio
```

To use the CLI globally:

```bash
npm install -g mnemonio
```

## Quick Start

```typescript
import { createMnemonioStore } from 'mnemonio';

const store = createMnemonioStore({
  memoryDir: './.mnemonio',
});

// Create the memory directory and MANIFEST.md if they don't exist
await store.ensureDir();

// Inject memory context into your system prompt
const memoryPrompt = await store.buildPrompt();
const systemPrompt = `You are a helpful assistant.\n\n${memoryPrompt}`;

// List all memory files
const headers = await store.scan();
console.log(store.formatManifest(headers));

// Get stats
const stats = await store.stats();
console.log(`${stats.totalFiles} files, ${stats.totalBytes} bytes`);
```

### With an LLM (search, extraction, distillation)

```typescript
import { createMnemonioStore, type LlmCallback } from 'mnemonio';

// Wire up any LLM provider -- this is the only integration point.
// The callback receives a system prompt, messages, and max tokens,
// and returns the model's text response.
const llm: LlmCallback = async ({ system, messages, maxTokens }) => {
  // Replace with your provider's SDK or HTTP call
  const response = await yourClient.chat({
    model: 'your-model',
    max_tokens: maxTokens,
    system,
    messages,
  });
  return response.text;
};

const store = createMnemonioStore({
  memoryDir: './.mnemonio',
  llm,
});

// Semantic search
const results = await store.findRelevant('database testing approach');

// Extract memories from a conversation
await store.extract({
  messages: [
    { role: 'user', content: "Don't mock the database in integration tests." },
    { role: 'assistant', content: 'Understood, I will use the real database.' },
  ],
});

// Consolidate (merge duplicates, prune stale entries)
await store.distill({ force: true });
```

## CLI

The CLI reads `MNEMONIO_API_KEY` from your environment for LLM-dependent
commands (`search`, `distill`). It speaks the standard chat completions protocol
(`/chat/completions`), so it works with any provider that exposes that interface.

```
mnemonio init [dir]                        Create memory directory with MANIFEST.md
mnemonio scan [dir] [--json]               Display all memory file headers
mnemonio list [dir] [--type <t>] [--json]  List memories with descriptions + age
mnemonio search <query> [dir] [--json]     Find relevant memories (LLM required)
mnemonio distill [dir] [--force] [--json]  Run consolidation pass (LLM required)
mnemonio stats [dir] [--json]              File count, size, type breakdown
mnemonio prune [dir] [--max-age <days>] [--dry-run]  Remove stale/empty files
```

All commands default to the current directory if `[dir]` is omitted.

## Configuration

```typescript
interface MnemonioConfig {
  /** Path to the memory directory */
  memoryDir: string;

  /** Optional path to a shared team memory directory */
  teamDir?: string;

  /** LLM callback -- required for search, extract, distill */
  llm?: LlmCallback;

  /** Name of the entrypoint file (default: "MANIFEST.md") */
  entrypointName?: string;

  /** Max lines to include from MANIFEST.md in prompts (default: 200) */
  maxEntrypointLines?: number;

  /** Max bytes to include from MANIFEST.md in prompts (default: 25000) */
  maxEntrypointBytes?: number;

  /** Optional structured logger */
  logger?: (msg: string, level: 'debug' | 'info' | 'warn' | 'error') => void;
}
```

The `LlmCallback` type accepts any provider. You wire it up once:

```typescript
type LlmCallback = (params: {
  system: string;
  messages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
}) => Promise<string>;
```

## Memory File Format

Each memory is a markdown file with YAML frontmatter:

```markdown
---
name: testing-approach
description: Team prefers integration tests with real DB over mocks
type: directive
tags: [testing, database]
---

Always use the real database for integration tests.

> reason: A prior incident where mocked tests passed but production broke on a
> schema change.

> scope: Use test containers or a dedicated test database. Never mock
> the DB layer in integration suites.
```

The `MANIFEST.md` file in the memory directory serves as the entrypoint. It
contains short one-line pointers to individual memory files. Mnemonio
auto-truncates it when injecting into prompts to stay within token budgets.

## Memory Types

| Type | Purpose |
|------|---------|
| `identity` | Information about the user -- role, goals, preferences, expertise |
| `directive` | Corrections and confirmed approaches -- behavioral guidance |
| `context` | Ongoing work, decisions, timelines, incidents |
| `bookmark` | Pointers to external systems, docs, dashboards, resources |

### Extended Frontmatter

| Field | Required | Description |
|-------|----------|-------------|
| `name` | No | Human-readable slug for the memory |
| `description` | No | One-line summary shown in listings and manifests |
| `type` | No | `identity`, `directive`, `context`, or `bookmark` |
| `tags` | No | Freeform labels for cross-cutting concerns |
| `expires` | No | ISO date after which this memory should be considered stale |

## Team Memory

Set `teamDir` in your config to point at a shared directory. Team memories are
read-only and appended to the prompt alongside private memories.

```typescript
const store = createMnemonioStore({
  memoryDir: './.mnemonio',
  teamDir: './team-memory',
});

// Combined prompt includes both private and team memories
const prompt = await store.buildCombinedPrompt();

// Path traversal protection for team writes
const safePath = await store.validateTeamWritePath('notes.md');
```

Path traversal attacks (symlinks, `../` segments, null bytes) are blocked by
`validateTeamWritePath`. Use `isTeamPath` to check if a path falls within the
team directory.

## API Reference

### Methods (no LLM required)

| Method | Returns | Description |
|--------|---------|-------------|
| `ensureDir()` | `Promise<void>` | Create memory dir and MANIFEST.md if missing |
| `scan(signal?)` | `Promise<MemoryHeader[]>` | List all memory files with frontmatter metadata |
| `readEntrypoint()` | `Promise<EntrypointTruncation>` | Read MANIFEST.md with truncation info |
| `buildPrompt()` | `Promise<string>` | Build memory context string for system prompts |
| `buildCombinedPrompt()` | `Promise<string>` | Build prompt including team memory |
| `stats(signal?)` | `Promise<MnemonioStats>` | File count, total size, type breakdown, age range |
| `formatManifest(headers)` | `string` | Format headers as a human-readable manifest |

### Methods (LLM required)

| Method | Returns | Description |
|--------|---------|-------------|
| `findRelevant(query, opts?)` | `Promise<RelevantMemory[]>` | Semantic search across memories |
| `extract(config)` | `Promise<ExtractResult>` | Extract memories from a conversation |
| `distill(config?)` | `Promise<DistillResult>` | Consolidate: merge duplicates, prune stale, tighten |

### Lock Management

| Method | Returns | Description |
|--------|---------|-------------|
| `readLastDistilledAt()` | `Promise<number>` | Timestamp of last distillation |
| `tryAcquireLock()` | `Promise<number \| null>` | Acquire distillation lock (null if held) |
| `rollbackLock(priorMtime)` | `Promise<void>` | Restore lock mtime on failure |

### Team Security

| Method | Returns | Description |
|--------|---------|-------------|
| `validateTeamWritePath(filePath)` | `Promise<string>` | Resolve and validate path within team dir |
| `isTeamPath(filePath)` | `boolean` | Check if path is inside team directory |

## License

MIT
