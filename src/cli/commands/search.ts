import { Command } from 'commander';
import { resolve } from 'node:path';
import { createMnemonioStore } from '../../store.js';
import { scanMemoryFiles } from '../../core/scan.js';
import { findRelevantMemories } from '../../relevance.js';
import { resolvePaths } from '../../core/paths.js';
import { resolveCliLlm } from '../llm.js';

export function searchCommand(): Command {
  return new Command('search')
    .description('Find relevant memories (LLM required)')
    .argument('<query>', 'Search query')
    .argument('[dir]', 'Memory directory path', '.')
    .option('--max <n>', 'Max results', '5')
    .option('--team-dir <dir>', 'Team memory directory')
    .option('--json', 'Output as JSON')
    .action(async (query: string, dir: string, opts: { readonly max?: string; readonly teamDir?: string; readonly json?: boolean }) => {
      const memoryDir = resolve(dir);
      const llm = resolveCliLlm();
      const store = createMnemonioStore({ memoryDir, llm });
      const maxResults = parseInt(opts.max ?? '5', 10);
      const { memoryDir: resolvedDir } = resolvePaths(memoryDir);

      const headers = await store.scan();
      const teamFileSet = new Set<string>();
      let allHeaders = [...headers];

      if (opts.teamDir) {
        const resolvedTeamDir = resolve(opts.teamDir);
        const teamHeaders = await scanMemoryFiles(resolvedTeamDir);
        for (const h of teamHeaders) {
          teamFileSet.add(h.filePath);
        }
        allHeaders = [...allHeaders, ...teamHeaders];
      }

      if (allHeaders.length === 0) {
        console.log('No relevant memories found.');
        return;
      }

      const results = await findRelevantMemories({
        llm,
        memoryDir: resolvedDir,
        headers: allHeaders,
        query,
        maxResults,
      });

      if (results.length === 0) {
        console.log('No relevant memories found.');
        return;
      }

      if (opts.json) {
        const tagged = results.map((r) => ({
          ...r,
          source: teamFileSet.has(r.filePath) ? 'team' : 'private',
        }));
        console.log(JSON.stringify(tagged, null, 2));
        return;
      }

      for (const r of results) {
        const score = (r.score * 100).toFixed(0);
        const tag = teamFileSet.has(r.filePath) ? ' [team]' : '';
        console.log(`  ${score}%  ${r.filename}${tag}`);
        console.log(`       ${r.reason}`);
        console.log();
      }
    });
}
