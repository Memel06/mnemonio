import { Command } from 'commander';
import { resolve } from 'node:path';
import { createMnemonioStore } from '../../store.js';
import { resolveCliLlm } from '../llm.js';

export function distillCommand(): Command {
  return new Command('distill')
    .description('Run consolidation pass (LLM required)')
    .argument('[dir]', 'Memory directory path', '.')
    .option('--force', 'Skip time gate')
    .option('--json', 'Output as JSON')
    .action(async (dir: string, opts: { readonly force?: boolean; readonly json?: boolean }) => {
      const memoryDir = resolve(dir);
      const llm = resolveCliLlm();
      const store = createMnemonioStore({ memoryDir, llm });

      console.log('Running distillation...');
      const result = await store.distill({ force: opts.force });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (!result.consolidated) {
        console.log(`Skipped: ${result.reason}`);
        return;
      }

      if (result.filesModified.length > 0) {
        console.log(`Modified: ${result.filesModified.join(', ')}`);
      }
      if (result.filesRemoved.length > 0) {
        console.log(`Removed: ${result.filesRemoved.join(', ')}`);
      }
      console.log('Distillation complete.');
    });
}
