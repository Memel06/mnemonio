import { Command } from 'commander';
import { resolve } from 'node:path';
import { createMnemonioStore } from '../../store.js';
import { formatFileSize } from '../../core/truncate.js';
import { memoryFreshnessText } from '../../core/memoryAge.js';

export function statsCommand(): Command {
  return new Command('stats')
    .description('Memory directory statistics')
    .argument('[dir]', 'Memory directory path', '.')
    .option('--json', 'Output as JSON')
    .action(async (dir: string, opts: { readonly json?: boolean }) => {
      const memoryDir = resolve(dir);
      const store = createMnemonioStore({ memoryDir });
      const s = await store.stats();

      if (opts.json) {
        console.log(JSON.stringify(s, null, 2));
        return;
      }

      console.log(`  Files:    ${s.totalFiles}`);
      console.log(`  Size:     ${formatFileSize(s.totalBytes)}`);
      console.log(`  Types:`);
      for (const [type, count] of Object.entries(s.byType)) {
        if (count > 0) {
          console.log(`    ${type}: ${count}`);
        }
      }
      if (s.oldestMtimeMs) {
        console.log(`  Oldest:   ${memoryFreshnessText(s.oldestMtimeMs)}`);
      }
      if (s.newestMtimeMs) {
        console.log(`  Newest:   ${memoryFreshnessText(s.newestMtimeMs)}`);
      }
    });
}
