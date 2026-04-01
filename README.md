# mnemonio

[mnemonio.com](https://mnemonio.com)

Persistent structured memory layer for LLM agents. Mnemonio gives your agent a
file-based memory system that survives across sessions -- markdown files with
YAML frontmatter, a manifest file, semantic search, automatic extraction from
conversations, and periodic consolidation.

It ships as an MCP server, a CLI, and a TypeScript library. LLM operations use
a callback you provide, so it works with any provider.

## MCP Server

The fastest way to get started. Add mnemonio to your MCP client settings and
your AI coding assistant gets persistent memory automatically.

### Setup

```json
{
  "mcpServers": {
    "mnemonio": {
      "command": "npx",
      "args": ["-p", "@memel06/mnemonio", "mnemonio-mcp"],
      "env": {
        "MNEMONIO_DIR": "./.mnemonio"
      }
    }
  }
}
```

For LLM-dependent tools (search, extract, distill), create a `.env` file in your
project root (and add it to `.gitignore`):

```env
MNEMONIO_API_KEY=your-api-key
MNEMONIO_BASE_URL=https://your-llm-provider.com/v1
MNEMONIO_MODEL=your-model
```

Mnemonio loads `.env` automatically.

You can also pass these as env vars in the MCP config if you prefer:

```json
{
  "mcpServers": {
    "mnemonio": {
      "command": "npx",
      "args": ["-p", "@memel06/mnemonio", "mnemonio-mcp"],
      "env": {
        "MNEMONIO_DIR": "./.mnemonio",
        "MNEMONIO_BASE_URL": "https://your-llm-provider.com/v1",
        "MNEMONIO_MODEL": "your-model"
      }
    }
  }
}
```

The server auto-detects the provider from the base URL:

| Base URL contains | Provider | Token param | Auth | Endpoint |
|-------------------|----------|-------------|------|----------|
| `openai.com` | OpenAI (modern) | `max_completion_tokens` | `Bearer` | `/chat/completions` |
| `anthropic.com` | Anthropic | `max_tokens` | `x-api-key` | `/v1/messages` |
| `openrouter.ai` | OpenRouter | `max_tokens` | `Bearer` | `/chat/completions` |
| anything else | Generic (OpenAI-compatible) | `max_tokens` | `Bearer` | `/chat/completions` |

Override auto-detection with `MNEMONIO_PROVIDER` (in `.env` or MCP config):

```env
MNEMONIO_PROVIDER=anthropic
MNEMONIO_API_KEY=sk-ant-...
MNEMONIO_BASE_URL=https://api.anthropic.com
MNEMONIO_MODEL=claude-sonnet-4-6-20250514
```

Valid provider values: `openai`, `openai-classic`, `anthropic`, `openrouter`.

### Available Tools

| Tool | LLM needed | Team aware | Description |
|------|-----------|------------|-------------|
| `memory_list` | No | Yes | List all memories, optionally filtered by type |
| `memory_read` | No | Yes | Read full content of a memory file |
| `memory_save` | No | No | Save a new memory with frontmatter + manifest entry |
| `memory_search` | Yes | Yes | Semantic search across all memories |
| `memory_extract` | Yes | No | Auto-extract durable facts from a conversation |
| `memory_distill` | Yes | No | Consolidate: merge duplicates, prune stale, tighten |
| `memory_stats` | No | Yes | File count, size, type breakdown |

## Team Memory

Team memory is a shared, read-only directory that gives every developer's agent
the same baseline context -- coding standards, onboarding notes, project
conventions. Commit it to your repo so the whole team shares it.

### MCP Server

Set `MNEMONIO_TEAM_DIR` in your MCP config:

```json
{
  "mcpServers": {
    "mnemonio": {
      "command": "npx",
      "args": ["-p", "@memel06/mnemonio", "mnemonio-mcp"],
      "env": {
        "MNEMONIO_DIR": "./.mnemonio",
        "MNEMONIO_TEAM_DIR": "./team-memory"
      }
    }
  }
}
```

Team memories automatically appear in `memory_list`, `memory_read`,
`memory_search`, and `memory_stats`. Write operations (`memory_save`,
`memory_extract`, `memory_distill`) only touch the private directory.

### CLI

Use `--team-dir` with any read command:

```bash
mnemonio list .mnemonio --team-dir ./team-memory
mnemonio search "coding standards" .mnemonio --team-dir ./team-memory
```

### Library

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

### Security

Path traversal attacks (symlinks, `../` segments, null bytes) are blocked by
`validateTeamWritePath`. Use `isTeamPath` to check if a path falls within the
team directory.

## CLI

```bash
npm install -g @memel06/mnemonio
```

The CLI reads `MNEMONIO_API_KEY` from your environment for LLM-dependent
commands (`search`, `distill`). It auto-detects the provider from
`MNEMONIO_BASE_URL` (or you can set `MNEMONIO_PROVIDER` explicitly) and works
with OpenAI, Anthropic, OpenRouter, and any OpenAI-compatible endpoint.

```
mnemonio init [dir]                        Create memory directory with MANIFEST.md
mnemonio scan [dir] [--team-dir <d>] [--json]               Display all memory file headers
mnemonio list [dir] [--type <t>] [--team-dir <d>] [--json]  List memories with descriptions + age
mnemonio search <query> [dir] [--team-dir <d>] [--json]     Find relevant memories (LLM required)
mnemonio distill [dir] [--force] [--json]  Run consolidation pass (LLM required)
mnemonio stats [dir] [--team-dir <d>] [--json]              File count, size, type breakdown
mnemonio prune [dir] [--max-age <days>] [--dry-run]         Remove stale/empty files
```

All commands default to the current directory if `[dir]` is omitted. Use `--team-dir`
to include a shared team memory directory in listings, search, and stats.

## Library

```bash
npm install @memel06/mnemonio
```

### Quick Start

```typescript
import { createMnemonioStore } from '@memel06/mnemonio';

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

The quickest way is to use the built-in `resolveLlm` helper, which reads
`MNEMONIO_API_KEY`, `MNEMONIO_BASE_URL`, `MNEMONIO_MODEL`, and
`MNEMONIO_PROVIDER` from your environment and auto-detects the provider:

```typescript
import { createMnemonioStore, resolveLlm } from '@memel06/mnemonio';

const store = createMnemonioStore({
  memoryDir: './.mnemonio',
  llm: resolveLlm(),
});
```

Or wire up your own callback for full control:

```typescript
import { createMnemonioStore, type LlmCallback } from '@memel06/mnemonio';

const llm: LlmCallback = async ({ system, messages, maxTokens }) => {
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

### Configuration

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

### API Reference

#### Methods (no LLM required)

| Method | Returns | Description |
|--------|---------|-------------|
| `ensureDir()` | `Promise<void>` | Create memory dir and MANIFEST.md if missing |
| `scan(signal?)` | `Promise<MemoryHeader[]>` | List all memory files with frontmatter metadata |
| `readEntrypoint()` | `Promise<EntrypointTruncation>` | Read MANIFEST.md with truncation info |
| `buildPrompt()` | `Promise<string>` | Build memory context string for system prompts |
| `buildCombinedPrompt()` | `Promise<string>` | Build prompt including team memory |
| `stats(signal?)` | `Promise<MnemonioStats>` | File count, total size, type breakdown, age range |
| `formatManifest(headers)` | `string` | Format headers as a human-readable manifest |

#### Methods (LLM required)

| Method | Returns | Description |
|--------|---------|-------------|
| `findRelevant(query, opts?)` | `Promise<RelevantMemory[]>` | Semantic search across memories |
| `extract(config)` | `Promise<ExtractResult>` | Extract memories from a conversation |
| `distill(config?)` | `Promise<DistillResult>` | Consolidate: merge duplicates, prune stale, tighten |

#### Lock Management

| Method | Returns | Description |
|--------|---------|-------------|
| `readLastDistilledAt()` | `Promise<number>` | Timestamp of last distillation |
| `tryAcquireLock()` | `Promise<number \| null>` | Acquire distillation lock (null if held) |
| `rollbackLock(priorMtime)` | `Promise<void>` | Restore lock mtime on failure |

#### Team Security

| Method | Returns | Description |
|--------|---------|-------------|
| `validateTeamWritePath(filePath)` | `Promise<string>` | Resolve and validate path within team dir |
| `isTeamPath(filePath)` | `boolean` | Check if path is inside team directory |

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

## License

MIT
