import { readFile } from 'node:fs/promises';
import type { MnemonioConfig } from '../types.js';
import { resolvePaths } from '../core/paths.js';
import { scanMemoryFiles, formatMemoryManifest } from '../core/scan.js';
import { truncateEntrypointContent } from '../core/truncate.js';
import { buildTypePromptSection } from '../core/memoryTypes.js';

export async function buildMemoryPrompt(config: MnemonioConfig): Promise<string> {
  const { memoryDir, entrypoint } = resolvePaths(config.memoryDir, config.entrypointName);
  const maxLines = config.maxEntrypointLines ?? 200;
  const maxBytes = config.maxEntrypointBytes ?? 25_000;

  let entrypointContent = '';
  try {
    const raw = await readFile(entrypoint, 'utf-8');
    const truncation = truncateEntrypointContent(raw, maxLines, maxBytes);
    entrypointContent = truncation.content;
    if (truncation.wasTruncated) {
      entrypointContent += `\n\n(truncated: ${truncation.keptLines}/${truncation.originalLines} lines shown)`;
    }
  } catch {
    // No entrypoint yet
  }

  const headers = await scanMemoryFiles(memoryDir);
  const manifest = formatMemoryManifest(headers, memoryDir);

  const sections: string[] = [
    '# Agent Memory',
    '',
    'You have a persistent file-based memory store. Each memory is a markdown file with YAML frontmatter.',
    '',
    '## Categories',
    '',
    buildTypePromptSection(),
    '',
    '## Writing a Memory',
    '',
    'Create a `.md` file with frontmatter:',
    '',
    '```yaml',
    '---',
    'name: {{slug}}',
    'description: {{one-line summary}}',
    'type: {{identity | directive | context | bookmark}}',
    'tags: [optional, freeform, labels]',
    'expires: {{optional ISO date after which this memory is stale}}',
    '---',
    '```',
    '',
    'Then add a one-liner to MANIFEST.md so it shows up in the index.',
    '',
  ];

  if (entrypointContent) {
    sections.push('## Manifest', '', entrypointContent, '');
  }

  if (headers.length > 0) {
    sections.push('## Stored Memories', '', manifest, '');
  }

  return sections.join('\n');
}
