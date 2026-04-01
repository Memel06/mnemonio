import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile, writeFile, appendFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createMnemonioStore } from './store.js';
import { buildFrontmatter } from './core/frontmatter.js';
import { parseMemoryType } from './core/memoryTypes.js';
import { resolvePaths, isInsideDir } from './core/paths.js';
import { scanMemoryFiles, formatMemoryManifest } from './core/scan.js';
import { findRelevantMemories } from './relevance.js';
import { resolveLlm } from './core/llm.js';

const memoryDir = process.env['MNEMONIO_DIR'] ?? './.mnemonio';
const teamDir = process.env['MNEMONIO_TEAM_DIR'];
const resolvedTeamDir = teamDir ? resolve(teamDir) : undefined;
const llm = resolveLlm();
const store = createMnemonioStore({ memoryDir, teamDir, llm });

const server = new McpServer(
  { name: 'mnemonio', version: __VERSION__ },
  {
    instructions:
      'Persistent file-based memory for LLM agents. Use these tools to search, read, save, and manage memories across sessions.',
  },
);

// -- memory_list --

server.registerTool('memory_list', {
  description:
    'List all stored memories with type, age, and description. Use this to see what the agent already knows.',
  inputSchema: {
    type: z.optional(
      z.enum(['identity', 'directive', 'context', 'bookmark']),
    ),
  },
}, async ({ type }) => {
  await store.ensureDir();
  const headers = await store.scan();
  const filtered = type
    ? headers.filter((h) => h.type === type)
    : headers;

  const sections: string[] = [];

  if (filtered.length > 0) {
    sections.push(store.formatManifest(filtered));
  }

  if (resolvedTeamDir) {
    const teamHeaders = await scanMemoryFiles(resolvedTeamDir);
    const teamFiltered = type
      ? teamHeaders.filter((h) => h.type === type)
      : teamHeaders;
    if (teamFiltered.length > 0) {
      const teamManifest = formatMemoryManifest(teamFiltered, resolvedTeamDir);
      sections.push(`\n## Team Memory (shared, read-only)\n\n${teamManifest}`);
    }
  }

  if (sections.length === 0) {
    return { content: [{ type: 'text', text: '(no memories stored)' }] };
  }

  return { content: [{ type: 'text', text: sections.join('\n') }] };
});

// -- memory_read --

server.registerTool('memory_read', {
  description:
    'Read the full content of a specific memory file by filename.',
  inputSchema: {
    filename: z.string().describe('The memory filename, e.g. "directive_testing.md"'),
  },
}, async ({ filename }) => {
  const filePath = join(memoryDir, filename);
  if (isInsideDir(memoryDir, filePath)) {
    try {
      const content = await readFile(filePath, 'utf-8');
      return { content: [{ type: 'text', text: content }] };
    } catch {
      // Not in private dir -- fall through to team dir
    }
  }

  if (resolvedTeamDir) {
    const teamPath = join(resolvedTeamDir, filename);
    if (isInsideDir(resolvedTeamDir, teamPath)) {
      try {
        const content = await readFile(teamPath, 'utf-8');
        return { content: [{ type: 'text', text: `[team memory, read-only]\n\n${content}` }] };
      } catch {
        // Not found in team dir either
      }
    }
  }

  return {
    content: [{ type: 'text', text: `File not found: ${filename}` }],
    isError: true,
  };
});

// -- memory_save --

server.registerTool('memory_save', {
  description:
    'Save a new memory or update an existing one. Creates a markdown file with YAML frontmatter and appends to the manifest.',
  inputSchema: {
    filename: z.string().describe('Filename for the memory, e.g. "directive_testing.md"'),
    name: z.string().describe('Short slug name for the memory'),
    description: z.string().describe('One-line summary of what this memory captures'),
    type: z.enum(['identity', 'directive', 'context', 'bookmark']).describe('Memory category'),
    body: z.string().describe('The memory content (markdown)'),
    tags: z.optional(z.array(z.string())).describe('Optional freeform tags'),
    expires: z.optional(z.string()).describe('Optional ISO date after which this memory is stale'),
  },
}, async ({ filename, name, description, type, body, tags, expires }) => {
  await store.ensureDir();

  const filePath = join(memoryDir, filename);
  if (!isInsideDir(memoryDir, filePath)) {
    return {
      content: [{ type: 'text', text: 'Error: invalid filename.' }],
      isError: true,
    };
  }

  if (resolvedTeamDir) {
    const teamPath = join(resolvedTeamDir, filename);
    if (isInsideDir(resolvedTeamDir, teamPath)) {
      try {
        await stat(teamPath);
        return {
          content: [{ type: 'text', text: `Error: "${filename}" shadows a team memory. Choose a different filename.` }],
          isError: true,
        };
      } catch {
        // No team file with this name — proceed
      }
    }
  }

  const parsedType = parseMemoryType(type);
  const fm = buildFrontmatter({
    name,
    description,
    type: parsedType,
    tags,
    expires,
  });

  let isNew = true;
  try {
    await stat(filePath);
    isNew = false;
  } catch {
    // File doesn't exist yet — new memory
  }

  const content = `${fm}\n\n${body}\n`;
  await writeFile(filePath, content, 'utf-8');

  if (isNew) {
    const entry = `- [${name}](${filename}) -- ${description}\n`;
    const { entrypoint } = getEntrypoint();
    try {
      await appendFile(entrypoint, entry, 'utf-8');
    } catch {
      await writeFile(entrypoint, `# Memory Manifest\n\n${entry}`, 'utf-8');
    }
  }

  return {
    content: [{ type: 'text', text: `${isNew ? 'Created' : 'Updated'}: ${filename}` }],
  };
});

// -- memory_search --

server.registerTool('memory_search', {
  description:
    'Semantic search across all memories. Returns the most relevant memories for a query. Requires MNEMONIO_API_KEY.',
  inputSchema: {
    query: z.string().describe('Natural language search query'),
    max_results: z.optional(z.number().int().min(1).max(20)).describe('Max results to return (default: 5)'),
  },
}, async ({ query, max_results }) => {
  if (!llm) {
    return {
      content: [{ type: 'text', text: 'Error: MNEMONIO_API_KEY not set. Search requires an LLM.' }],
      isError: true,
    };
  }

  await store.ensureDir();
  const { memoryDir: resolvedDir } = resolvePaths(memoryDir);
  const headers = await store.scan();

  const teamFileSet = new Set<string>();
  let allHeaders = [...headers];
  if (resolvedTeamDir) {
    const teamHeaders = await scanMemoryFiles(resolvedTeamDir);
    for (const h of teamHeaders) {
      teamFileSet.add(h.filePath);
    }
    allHeaders = [...allHeaders, ...teamHeaders];
  }

  if (allHeaders.length === 0) {
    return { content: [{ type: 'text', text: 'No relevant memories found.' }] };
  }

  const results = await findRelevantMemories({
    llm,
    memoryDir: resolvedDir,
    headers: allHeaders,
    query,
    maxResults: max_results ?? 5,
  });

  if (results.length === 0) {
    return { content: [{ type: 'text', text: 'No relevant memories found.' }] };
  }

  const lines = results.map((r) => {
    const tag = teamFileSet.has(r.filePath) ? ' [team]' : '';
    return `${Math.round(r.score * 100)}%  ${r.filename}${tag}\n     ${r.reason}`;
  });
  return { content: [{ type: 'text', text: lines.join('\n\n') }] };
});

// -- memory_extract --

server.registerTool('memory_extract', {
  description:
    'Analyze a conversation and automatically extract durable memories worth persisting. Requires MNEMONIO_API_KEY.',
  inputSchema: {
    messages: z.array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    ).describe('The conversation messages to analyze'),
  },
}, async ({ messages }) => {
  if (!llm) {
    return {
      content: [{ type: 'text', text: 'Error: MNEMONIO_API_KEY not set. Extract requires an LLM.' }],
      isError: true,
    };
  }

  await store.ensureDir();
  const result = await store.extract({ messages });

  if (result.skipped) {
    return {
      content: [{ type: 'text', text: `Skipped: ${result.reason ?? 'nothing worth extracting'}` }],
    };
  }

  const parts: string[] = [];
  if (result.filesWritten.length > 0)
    parts.push(`Created: ${result.filesWritten.join(', ')}`);
  if (result.filesUpdated.length > 0)
    parts.push(`Updated: ${result.filesUpdated.join(', ')}`);

  return { content: [{ type: 'text', text: parts.join('\n') || 'No changes.' }] };
});

// -- memory_distill --

server.registerTool('memory_distill', {
  description:
    'Consolidate memories: merge duplicates, remove obsolete entries, tighten prose. Requires MNEMONIO_API_KEY.',
  inputSchema: {
    force: z.optional(z.boolean()).describe('Skip the 5-minute cooldown between runs'),
  },
}, async ({ force }) => {
  if (!llm) {
    return {
      content: [{ type: 'text', text: 'Error: MNEMONIO_API_KEY not set. Distill requires an LLM.' }],
      isError: true,
    };
  }

  await store.ensureDir();
  const result = await store.distill({ force: force ?? false });

  if (!result.consolidated) {
    return {
      content: [{ type: 'text', text: `Skipped: ${result.reason ?? 'no changes needed'}` }],
    };
  }

  const parts: string[] = [];
  if (result.filesModified.length > 0)
    parts.push(`Modified: ${result.filesModified.join(', ')}`);
  if (result.filesRemoved.length > 0)
    parts.push(`Removed: ${result.filesRemoved.join(', ')}`);

  return { content: [{ type: 'text', text: parts.join('\n') || 'Consolidated.' }] };
});

// -- memory_stats --

server.registerTool('memory_stats', {
  description: 'Get statistics about the memory store: file count, size, type breakdown, age range.',
}, async () => {
  await store.ensureDir();
  const s = await store.stats();

  const lines = [
    `Files: ${s.totalFiles}`,
    `Size: ${s.totalBytes} bytes`,
    `Types:`,
    `  identity: ${s.byType.identity}`,
    `  directive: ${s.byType.directive}`,
    `  context: ${s.byType.context}`,
    `  bookmark: ${s.byType.bookmark}`,
    `  unknown: ${s.byType.unknown}`,
  ];

  if (resolvedTeamDir) {
    const teamHeaders = await scanMemoryFiles(resolvedTeamDir);
    lines.push('', `Team files: ${teamHeaders.length}`);
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
});

// -- helper --

function getEntrypoint(): { entrypoint: string } {
  return resolvePaths(memoryDir);
}

// -- start --

async function main(): Promise<void> {
  await store.ensureDir();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('mnemonio MCP server failed:', err);
  process.exit(1);
});
