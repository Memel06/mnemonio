import { Command } from 'commander';
import { resolve } from 'node:path';
import { createMnemonioStore } from '../../store.js';
import { scanMemoryFiles } from '../../core/scan.js';
import { formatFileSize } from '../../core/truncate.js';
import { memoryFreshnessText } from '../../core/memoryAge.js';

export function statsCommand(): Command {
  return new Command('stats')
    .description('Memory directory statistics')
    .argument('[dir]', 'Memory directory path', '.')
    .option('--team-dir <dir>', 'Team memory directory')
    .option('--json', 'Output as JSON')
    .action(async (dir: string, opts: { readonly teamDir?: string; readonly json?: boolean }) => {
      const memoryDir = resolve(dir);
      const store = createMnemonioStore({ memoryDir });
      const s = await store.stats();

      if (opts.json) {
        const result: Record<string, unknown> = { ...s };
        if (opts.teamDir) {
          const teamHeaders = await scanMemoryFiles(resolve(opts.teamDir));
          result['teamFiles'] = teamHeaders.length;
        }
        console.log(JSON.stringify(result, null, 2));
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

      if (opts.teamDir) {
        const teamHeaders = await scanMemoryFiles(resolve(opts.teamDir));
        if (teamHeaders.length > 0) {
          console.log(`\n  Team:     ${teamHeaders.length} file(s)`);
        }
      }
    });
}
