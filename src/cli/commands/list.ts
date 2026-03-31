import { Command } from 'commander';
import { resolve } from 'node:path';
import { createMnemonioStore } from '../../store.js';
import { memoryFreshnessText } from '../../core/memoryAge.js';

export function listCommand(): Command {
  return new Command('list')
    .description('List memories with descriptions and age')
    .argument('[dir]', 'Memory directory path', '.')
    .option('--type <type>', 'Filter by memory type')
    .option('--json', 'Output as JSON')
    .action(async (dir: string, opts: { readonly type?: string; readonly json?: boolean }) => {
      const memoryDir = resolve(dir);
      const store = createMnemonioStore({ memoryDir });
      let headers = await store.scan();

      if (opts.type) {
        headers = headers.filter(h => h.type === opts.type);
      }

      if (headers.length === 0) {
        console.log('No memory files found.');
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(headers, null, 2));
        return;
      }

      const maxNameLen = Math.max(...headers.map(h => h.filename.length));

      for (const h of headers) {
        const name = h.filename.padEnd(maxNameLen);
        const age = memoryFreshnessText(h.mtimeMs).padStart(8);
        const type = (h.type ?? '???').padEnd(10);
        const desc = h.description ?? '';
        console.log(`  ${name}  ${type}  ${age}  ${desc}`);
      }
    });
}
