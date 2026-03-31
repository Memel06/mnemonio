import { Command } from 'commander';
import { resolve } from 'node:path';
import { createMnemonioStore } from '../../store.js';

export function scanCommand(): Command {
  return new Command('scan')
    .description('Display all memory file headers')
    .argument('[dir]', 'Memory directory path', '.')
    .option('--json', 'Output as JSON')
    .action(async (dir: string, opts: { readonly json?: boolean }) => {
      const memoryDir = resolve(dir);
      const store = createMnemonioStore({ memoryDir });
      const headers = await store.scan();

      if (headers.length === 0) {
        console.log('No memory files found.');
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(headers, null, 2));
        return;
      }

      console.log(store.formatManifest(headers));
    });
}
