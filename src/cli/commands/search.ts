import { Command } from 'commander';
import { resolve } from 'node:path';
import { createMnemonioStore } from '../../store.js';
import { resolveCliLlm } from '../llm.js';

export function searchCommand(): Command {
  return new Command('search')
    .description('Find relevant memories (LLM required)')
    .argument('<query>', 'Search query')
    .argument('[dir]', 'Memory directory path', '.')
    .option('--max <n>', 'Max results', '5')
    .option('--json', 'Output as JSON')
    .action(async (query: string, dir: string, opts: { readonly max?: string; readonly json?: boolean }) => {
      const memoryDir = resolve(dir);
      const llm = resolveCliLlm();
      const store = createMnemonioStore({ memoryDir, llm });
      const maxResults = parseInt(opts.max ?? '5', 10);

      const results = await store.findRelevant(query, { maxResults });

      if (results.length === 0) {
        console.log('No relevant memories found.');
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      for (const r of results) {
        const score = (r.score * 100).toFixed(0);
        console.log(`  ${score}%  ${r.filename}`);
        console.log(`       ${r.reason}`);
        console.log();
      }
    });
}
