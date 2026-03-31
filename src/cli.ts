import { Command } from 'commander';
import { initCommand } from './cli/commands/init.js';
import { scanCommand } from './cli/commands/scan.js';
import { listCommand } from './cli/commands/list.js';
import { searchCommand } from './cli/commands/search.js';
import { distillCommand } from './cli/commands/distill.js';
import { statsCommand } from './cli/commands/stats.js';
import { pruneCommand } from './cli/commands/prune.js';

const program = new Command();

program
  .name('mnemonio')
  .description('Persistent structured memory layer for LLM agents')
  .version('0.1.0');

program.addCommand(initCommand());
program.addCommand(scanCommand());
program.addCommand(listCommand());
program.addCommand(searchCommand());
program.addCommand(distillCommand());
program.addCommand(statsCommand());
program.addCommand(pruneCommand());

program.parse();
