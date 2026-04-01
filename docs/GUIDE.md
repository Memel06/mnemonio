# Mnemonio Guide

A practical walkthrough for integrating mnemonio into your project.

## MCP Server (AI Coding Assistants)

Mnemonio ships an MCP server that exposes memory tools to any MCP-compatible
client. This is the recommended way to integrate with AI coding assistants --
the agent discovers the tools automatically.

### Quick Setup

Add to your MCP client settings (e.g. `settings.json`):

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

That's it. The agent now has access to 7 memory tools:

| Tool | LLM needed | Team aware | What it does |
|------|-----------|------------|--------------|
| `memory_list` | No | Yes | List all memories, optionally filtered by type |
| `memory_read` | No | Yes | Read full content of a memory file |
| `memory_save` | No | No | Save a new memory with frontmatter + manifest entry |
| `memory_search` | Yes | Yes | Semantic search across all memories |
| `memory_extract` | Yes | No | Auto-extract durable facts from a conversation |
| `memory_distill` | Yes | No | Consolidate: merge duplicates, prune stale, tighten |
| `memory_stats` | No | Yes | File count, size, type breakdown |

To include shared team memories, add `MNEMONIO_TEAM_DIR`:

```json
{
  "env": {
    "MNEMONIO_DIR": "./.mnemonio",
    "MNEMONIO_TEAM_DIR": "./team-memory"
  }
}
```

Team memories appear in list, read, search, and stats. Write operations only
touch the private directory. See the [Team Memory](#team-memory) section below.

### LLM-Dependent Tools

For `memory_search`, `memory_extract`, and `memory_distill`, the MCP server
needs an LLM. Add these env vars:

```json
{
  "env": {
    "MNEMONIO_DIR": "./.mnemonio",
    "MNEMONIO_API_KEY": "your-api-key",
    "MNEMONIO_BASE_URL": "https://api.openai.com/v1",
    "MNEMONIO_MODEL": "gpt-4o"
  }
}
```

The server auto-detects the provider from the base URL:

| Base URL contains | Provider | Notes |
|-------------------|----------|-------|
| `openai.com` | OpenAI (modern) | Uses `max_completion_tokens` for GPT-4o+ |
| `anthropic.com` | Anthropic | Uses Messages API (`/v1/messages`, `x-api-key`) |
| `openrouter.ai` | OpenRouter | Uses `/chat/completions` with `max_tokens` |
| anything else | Generic | OpenAI-compatible `/chat/completions` |

Override auto-detection with `MNEMONIO_PROVIDER` if needed (e.g., when using a
proxy):

```json
{
  "env": {
    "MNEMONIO_PROVIDER": "anthropic",
    "MNEMONIO_API_KEY": "sk-ant-...",
    "MNEMONIO_BASE_URL": "https://api.anthropic.com",
    "MNEMONIO_MODEL": "claude-sonnet-4-6-20250514"
  }
}
```

Valid provider values: `openai`, `openai-classic`, `anthropic`, `openrouter`.
Use `openai-classic` for older OpenAI models (GPT-3.5, GPT-4 Turbo) that
require `max_tokens` instead of `max_completion_tokens`.

### Global Install

If you install mnemonio globally (`npm i -g @memel06/mnemonio`), you can use the binary
directly instead of `npx`:

```json
{
  "mcpServers": {
    "mnemonio": {
      "command": "mnemonio-mcp",
      "env": { "MNEMONIO_DIR": "./.mnemonio" }
    }
  }
}
```

### How It Works

Once configured, the agent can:

1. **Save memories mid-conversation** -- when you share your role, preferences,
   or project context, the agent calls `memory_save` to persist it
2. **Search before answering** -- calls `memory_search` to find relevant context
3. **Read specific memories** -- calls `memory_read` for full details
4. **Auto-extract after conversations** -- calls `memory_extract` to capture
   durable facts
5. **Consolidate periodically** -- calls `memory_distill` to merge duplicates

No CLAUDE.md instructions needed. The tools are self-describing and the agent
discovers them via the MCP protocol.

---

## Setting Up

### 1. Install

```bash
npm install mnemonio
```

### 2. Initialize the memory directory

From the library:

```typescript
import { createMnemonioStore } from 'mnemonio';

const store = createMnemonioStore({ memoryDir: './.mnemonio' });
await store.ensureDir();
```

Or from the CLI:

```bash
mnemonio init .mnemonio
```

This creates the directory and a `MANIFEST.md` entrypoint file:

```
.mnemonio/
  MANIFEST.md
```

### 3. Add to .gitignore (optional)

If memories are per-developer and should not be committed:

```
.mnemonio/
```

If you want memories tracked in version control, skip this step.

## Creating a Memory File Manually

Create a markdown file in your memory directory with YAML frontmatter:

```bash
cat > .mnemonio/identity_role.md << 'EOF'
---
name: role
description: User is a backend engineer focused on observability
type: identity
tags: [team, background]
---

Backend engineer working on the observability platform. Primary language is Go.
Responsible for the logging pipeline and trace ingestion service.
EOF
```

Then add a pointer in `MANIFEST.md`:

```markdown
# Memory Manifest

- [Role](identity_role.md) -- backend engineer, observability team
```

The frontmatter fields:

| Field | Required | Values |
|-------|----------|--------|
| `name` | No | Human-readable slug for the memory |
| `description` | No | One-line summary shown in listings and manifests |
| `type` | No | `identity`, `directive`, `context`, or `bookmark` |
| `tags` | No | Freeform labels (array of strings) |
| `expires` | No | ISO date after which this memory is stale |

## Integrating with an Agent Loop

### Wiring Up the LLM Callback

**Option 1: Built-in provider resolution** (easiest)

Use the `resolveLlm` helper, which reads environment variables and
auto-detects the provider:

```typescript
import { createMnemonioStore, resolveLlm } from 'mnemonio';

const store = createMnemonioStore({
  memoryDir: './.mnemonio',
  llm: resolveLlm(),
});

await store.ensureDir();
```

Set `MNEMONIO_API_KEY`, `MNEMONIO_BASE_URL`, and `MNEMONIO_MODEL` in your
environment. The provider (OpenAI, Anthropic, OpenRouter, or generic) is
auto-detected from the URL, or override with `MNEMONIO_PROVIDER`.

**Option 2: Custom callback** (full control)

Write one callback function that takes a system prompt, messages, and max
tokens, and returns the model's text response:

```typescript
import { createMnemonioStore, type LlmCallback } from 'mnemonio';

const llm: LlmCallback = async ({ system, messages, maxTokens }) => {
  const response = await yourProvider.chat.create({
    model: 'your-preferred-model',
    max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, ...messages],
  });
  return response.choices[0].message.content;
};

const store = createMnemonioStore({
  memoryDir: './.mnemonio',
  llm,
});

await store.ensureDir();
```

### Using in a Chat Loop

```typescript
async function chat(userMessage: string): Promise<string> {
  // Build the memory-augmented system prompt
  const memoryContext = await store.buildPrompt();
  const systemPrompt = [
    'You are a helpful engineering assistant.',
    '',
    memoryContext,
  ].join('\n');

  const response = await yourProvider.chat.create({
    model: 'your-preferred-model',
    max_tokens: 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  const assistantText = response.choices[0].message.content;

  // Extract memories from the conversation
  await store.extract({
    messages: [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: assistantText },
    ],
  });

  return assistantText;
}
```

### Vercel AI SDK

The Vercel AI SDK uses a different message format, so map its messages to
mnemonio's `{ role, content }` shape.

```typescript
import { generateText } from 'ai';
import { createMnemonioStore, type LlmCallback } from 'mnemonio';

const llm: LlmCallback = async ({ system, messages, maxTokens }) => {
  const result = await generateText({
    model: yourModel,
    maxTokens,
    system,
    messages,
  });
  return result.text;
};

const store = createMnemonioStore({
  memoryDir: './.mnemonio',
  llm,
});

await store.ensureDir();

// In your route handler or server action:
async function handleChat(userMessage: string) {
  const memoryContext = await store.buildPrompt();

  const result = await generateText({
    model: yourModel,
    maxTokens: 4096,
    system: `You are a helpful assistant.\n\n${memoryContext}`,
    messages: [{ role: 'user', content: userMessage }],
  });

  // Extract memories after the conversation turn
  await store.extract({
    messages: [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: result.text },
    ],
  });

  return result.text;
}
```

## Using the CLI

### Inspect memories

```bash
# Show all memory files with metadata
mnemonio scan .mnemonio

# List with descriptions and age, filtered by type
mnemonio list .mnemonio --type directive

# Include team memories
mnemonio list .mnemonio --team-dir ./team-memory

# Machine-readable output
mnemonio list .mnemonio --json
```

### Search

Semantic search requires an API key and provider config in your environment:

```bash
export MNEMONIO_API_KEY=your-api-key
export MNEMONIO_BASE_URL=https://api.openai.com/v1  # or anthropic.com, openrouter.ai
export MNEMONIO_MODEL=gpt-4o
mnemonio search "database testing" .mnemonio
```

Output shows relevance scores and reasoning:

```
  87%  directive_testing.md
       Directly addresses database testing approach and constraints

  42%  context_auth_rewrite.md
       Mentions test infrastructure changes related to database
```

### Stats

```bash
mnemonio stats .mnemonio
```

```
  Files:    12
  Size:     8.3KB
  Types:
    identity: 2
    directive: 5
    context: 3
    bookmark: 2
  Oldest:   2mo ago
  Newest:   3h ago
```

### Prune stale files

```bash
# Preview what would be removed
mnemonio prune .mnemonio --dry-run --max-age 60

# Actually remove files older than 60 days or with empty bodies
mnemonio prune .mnemonio --max-age 60
```

## Extraction

Extraction analyzes a conversation and writes new memory files (or updates
existing ones) when it detects durable information worth persisting.

```typescript
const result = await store.extract({
  messages: conversationHistory,
  existingMemories: await store.scan(), // optional, auto-fetched if omitted
});

if (!result.skipped) {
  console.log('New files:', result.filesWritten);
  console.log('Updated:', result.filesUpdated);
}
```

What gets extracted:

- **identity** memories when the user reveals role, preferences, or expertise
- **directive** memories when the user corrects behavior or confirms an approach
- **context** memories for decisions, timelines, ongoing initiatives
- **bookmark** memories for pointers to external systems or docs

What does NOT get extracted:

- Ephemeral task details ("fix the typo on line 42")
- In-progress work state that will change within the session
- Information already captured in existing memory files

The extraction LLM decides autonomously. If nothing is worth saving, the result
comes back with `skipped: true`.

## Distillation

Distillation is a periodic consolidation pass that cleans up your memory
directory. It merges duplicates, removes obsolete entries, tightens prose, and
rewrites `MANIFEST.md`.

```typescript
const result = await store.distill();

if (result.consolidated) {
  console.log('Modified:', result.filesModified);
  console.log('Removed:', result.filesRemoved);
} else {
  console.log('Skipped:', result.reason);
}
```

Or via CLI:

```bash
mnemonio distill .mnemonio --force
```

### Time gating

By default, distillation skips if less than 5 minutes have passed since the
last run. This prevents redundant LLM calls. Override with `--force` (CLI) or
`{ force: true }` (library).

### Locking

Distillation acquires a file lock (`.mnemonio.lock`) to prevent concurrent runs.
The lock auto-expires after 10 minutes. If another process holds the lock, the
result returns `reason: 'lock held by another process'`.

### Running distillation on a schedule

Call `distill()` at the end of each session or on a cron. A simple approach:

```typescript
// At the end of an agent session
const result = await store.distill();
if (result.consolidated) {
  console.log(`Consolidated: ${result.filesModified.length} modified, ${result.filesRemoved.length} removed`);
}
```

## Team Memory

Team memory is a shared, read-only directory that gives every developer's agent
the same baseline context. Commit it to your repo so the whole team shares it.

### Setup

```
project-root/
  .mnemonio/           # private per-developer memory (gitignored)
  team-memory/         # shared, committed to git
    onboarding.md
    coding-standards.md
    MANIFEST.md
```

### MCP Server

Add `MNEMONIO_TEAM_DIR` to your MCP config. Team memories automatically appear
in `memory_list`, `memory_read`, `memory_search`, and `memory_stats`:

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

Write operations (`memory_save`, `memory_extract`, `memory_distill`) only touch
the private directory -- team memories are never modified by the agent.

### CLI

Use `--team-dir` with any read command:

```bash
mnemonio list .mnemonio --team-dir ./team-memory
mnemonio search "coding standards" .mnemonio --team-dir ./team-memory
mnemonio stats .mnemonio --team-dir ./team-memory
```

### Library

```typescript
const store = createMnemonioStore({
  memoryDir: './.mnemonio',
  teamDir: './team-memory',
});

// Includes both private and team memories
const prompt = await store.buildCombinedPrompt();
```

### Security

Team memory paths are validated against traversal attacks. Use
`validateTeamWritePath` before writing to the team directory:

```typescript
try {
  const safePath = await store.validateTeamWritePath('notes/standup.md');
  // safePath is resolved and verified to be inside teamDir
} catch (err) {
  // PathTraversalError if the path escapes the team directory
  console.error(err.message);
}
```

Blocked patterns:

- `../` segments that escape the team directory
- Absolute paths outside the team directory
- Symlinks that resolve outside the team directory
- Null bytes in paths

## Environment Variables

| Variable | Used by | Description |
|----------|---------|-------------|
| `MNEMONIO_API_KEY` | CLI, MCP server | API key for LLM-dependent operations |
| `MNEMONIO_BASE_URL` | CLI, MCP server | Provider base URL (default: OpenRouter) |
| `MNEMONIO_MODEL` | CLI, MCP server | Model identifier (default: `auto`) |
| `MNEMONIO_PROVIDER` | CLI, MCP server | Override auto-detection: `openai`, `openai-classic`, `anthropic`, `openrouter` |
| `MNEMONIO_DIR` | MCP server | Memory directory path (default: `./.mnemonio`) |
| `MNEMONIO_TEAM_DIR` | MCP server | Shared team memory directory (optional) |

The library itself does not read environment variables. The CLI and MCP server
read them. When using the library directly, you can either use the built-in
`resolveLlm()` helper (which reads these env vars) or provide your own
`LlmCallback`.

The CLI and MCP server auto-detect the provider from the base URL and format
requests accordingly -- OpenAI, Anthropic, OpenRouter, and generic
OpenAI-compatible endpoints are all supported out of the box.

## Troubleshooting

### "LLM callback required for this operation"

You called `findRelevant`, `extract`, or `distill` without passing `llm` in
your `MnemonioConfig`. These methods need an LLM. Provide a callback:

```typescript
const store = createMnemonioStore({
  memoryDir: './.mnemonio',
  llm: yourLlmCallback,
});
```

### "Set MNEMONIO_API_KEY"

The CLI's `search` and `distill` commands need an API key. Export one:

```bash
export MNEMONIO_API_KEY=your-api-key
```

Point at your provider (auto-detected from URL):

```bash
# OpenAI
export MNEMONIO_BASE_URL=https://api.openai.com/v1
export MNEMONIO_MODEL=gpt-4o

# Anthropic
export MNEMONIO_BASE_URL=https://api.anthropic.com
export MNEMONIO_MODEL=claude-sonnet-4-6-20250514

# OpenRouter (default if MNEMONIO_BASE_URL is not set)
export MNEMONIO_MODEL=auto

# Override auto-detection if needed
export MNEMONIO_PROVIDER=anthropic
```

### Distillation keeps returning "too soon since last distillation"

The default cooldown is 5 minutes. Use `--force` or `{ force: true }`:

```bash
mnemonio distill .mnemonio --force
```

### Distillation returns "lock held by another process"

Another process is running distillation. The lock expires after 10 minutes. If
the other process crashed, delete the lock file manually:

```bash
rm .mnemonio/.mnemonio.lock
```

### MANIFEST.md is getting truncated in prompts

Mnemonio truncates `MANIFEST.md` to 200 lines / 25KB by default. Increase the
limits if needed:

```typescript
const store = createMnemonioStore({
  memoryDir: './.mnemonio',
  maxEntrypointLines: 500,
  maxEntrypointBytes: 50_000,
});
```

Or consolidate your manifest -- run `mnemonio distill` to have the LLM rewrite
it more concisely.

### Memory files not showing up in scan

`scan()` reads all `.md` files in the memory directory except `MANIFEST.md`.
Check that:

1. The file has a `.md` extension
2. The file is directly in the memory directory (not in a subdirectory)
3. The file is readable by the current process

### Extraction produces no output

If `extract()` returns `skipped: true`, the LLM determined nothing in the
conversation was worth persisting. This is expected for routine exchanges. The
extraction agent is intentionally conservative -- it only saves information
useful in future conversations.
