import { Command } from 'commander';
import { resolve } from 'node:path';
import { createMnemonioStore } from '../../store.js';
import { scanMemoryFiles, formatMemoryManifest } from '../../core/scan.js';

export function scanCommand(): Command {
  return new Command('scan')
    .description('Display all memory file headers')
    .argument('[dir]', 'Memory directory path', '.')
    .option('--team-dir <dir>', 'Team memory directory')
    .option('--json', 'Output as JSON')
    .action(async (dir: string, opts: { readonly teamDir?: string; readonly json?: boolean }) => {
      const memoryDir = resolve(dir);
      const store = createMnemonioStore({ memoryDir });
      const headers = await store.scan();

      if (opts.json) {
        const teamHeaders = opts.teamDir
          ? await scanMemoryFiles(resolve(opts.teamDir))
          : [];
        const combined = {
          private: headers,
          ...(teamHeaders.length > 0 ? { team: teamHeaders } : {}),
        };
        console.log(JSON.stringify(combined, null, 2));
        return;
      }

      if (headers.length === 0 && !opts.teamDir) {
        console.log('No memory files found.');
        return;
      }

      if (headers.length > 0) {
        console.log(store.formatManifest(headers));
      }

      if (opts.teamDir) {
        const teamHeaders = await scanMemoryFiles(resolve(opts.teamDir));
        if (teamHeaders.length > 0) {
          if (headers.length > 0) console.log();
          console.log('Team Memory (shared, read-only):');
          console.log(formatMemoryManifest(teamHeaders, resolve(opts.teamDir)));
        } else if (headers.length === 0) {
          console.log('No memory files found.');
        }
      }
    });
}
