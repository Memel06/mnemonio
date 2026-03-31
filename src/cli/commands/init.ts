import { Command } from 'commander';
import { resolve } from 'node:path';
import { createMnemonioStore } from '../../store.js';

export function initCommand(): Command {
  return new Command('init')
    .description('Create memory directory with MANIFEST.md')
    .argument('[dir]', 'Memory directory path', '.')
    .action(async (dir: string) => {
      const memoryDir = resolve(dir);
      const store = createMnemonioStore({ memoryDir });
      await store.ensureDir();
      console.log(`Initialized mnemonio memory at ${memoryDir}`);
    });
}
