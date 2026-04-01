import { Command } from 'commander';
import { resolve } from 'node:path';
import { createMnemonioStore } from '../../store.js';
import { scanMemoryFiles } from '../../core/scan.js';
import { memoryFreshnessText } from '../../core/memoryAge.js';
import type { MemoryHeader } from '../../types.js';

function printHeaders(headers: ReadonlyArray<MemoryHeader>, label?: string): void {
  if (label) console.log(`\n${label}:`);

  const maxNameLen = Math.max(...headers.map(h => h.filename.length));

  for (const h of headers) {
    const name = h.filename.padEnd(maxNameLen);
    const age = memoryFreshnessText(h.mtimeMs).padStart(8);
    const type = (h.type ?? '???').padEnd(10);
    const desc = h.description ?? '';
    console.log(`  ${name}  ${type}  ${age}  ${desc}`);
  }
}

export function listCommand(): Command {
  return new Command('list')
    .description('List memories with descriptions and age')
    .argument('[dir]', 'Memory directory path', '.')
    .option('--type <type>', 'Filter by memory type')
    .option('--team-dir <dir>', 'Team memory directory')
    .option('--json', 'Output as JSON')
    .action(async (dir: string, opts: { readonly type?: string; readonly teamDir?: string; readonly json?: boolean }) => {
      const memoryDir = resolve(dir);
      const store = createMnemonioStore({ memoryDir });
      let headers = await store.scan();

      if (opts.type) {
        headers = headers.filter(h => h.type === opts.type);
      }

      let teamHeaders: ReadonlyArray<MemoryHeader> = [];
      if (opts.teamDir) {
        teamHeaders = await scanMemoryFiles(resolve(opts.teamDir));
        if (opts.type) {
          teamHeaders = teamHeaders.filter(h => h.type === opts.type);
        }
      }

      if (headers.length === 0 && teamHeaders.length === 0) {
        console.log('No memory files found.');
        return;
      }

      if (opts.json) {
        const combined = {
          private: headers,
          ...(teamHeaders.length > 0 ? { team: teamHeaders } : {}),
        };
        console.log(JSON.stringify(combined, null, 2));
        return;
      }

      if (headers.length > 0) {
        printHeaders(headers);
      }

      if (teamHeaders.length > 0) {
        printHeaders(teamHeaders, 'Team Memory (shared, read-only)');
      }
    });
}
