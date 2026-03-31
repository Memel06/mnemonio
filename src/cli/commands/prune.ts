import { Command } from 'commander';
import { resolve } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { createMnemonioStore } from '../../store.js';
import { parseFrontmatter } from '../../core/frontmatter.js';
import { memoryAge } from '../../core/memoryAge.js';

export function pruneCommand(): Command {
  return new Command('prune')
    .description('Remove stale or empty memory files')
    .argument('[dir]', 'Memory directory path', '.')
    .option('--max-age <days>', 'Remove files older than N days', '90')
    .option('--dry-run', 'Show what would be removed without removing')
    .action(async (dir: string, opts: { readonly maxAge?: string; readonly dryRun?: boolean }) => {
      const memoryDir = resolve(dir);
      const store = createMnemonioStore({ memoryDir });
      const headers = await store.scan();
      const maxAgeDays = parseInt(opts.maxAge ?? '90', 10);
      const removed: string[] = [];

      for (const h of headers) {
        let shouldRemove = false;
        let reason = '';

        try {
          const content = await readFile(h.filePath, 'utf-8');
          const { body } = parseFrontmatter(content);
          if (body.trim().length === 0) {
            shouldRemove = true;
            reason = 'empty body';
          }
        } catch {
          shouldRemove = true;
          reason = 'unreadable';
        }

        if (!shouldRemove) {
          const age = memoryAge(h.mtimeMs);
          if (age.ageDays > maxAgeDays) {
            shouldRemove = true;
            reason = `stale (${Math.floor(age.ageDays)}d old)`;
          }
        }

        if (!shouldRemove) continue;

        if (opts.dryRun) {
          console.log(`  would remove: ${h.filename} (${reason})`);
        } else {
          try {
            await unlink(h.filePath);
            console.log(`  removed: ${h.filename} (${reason})`);
          } catch { /* file already gone */ }
        }
        removed.push(h.filename);
      }

      if (removed.length === 0) {
        console.log('Nothing to prune.');
      } else {
        console.log(`\n${opts.dryRun ? 'Would remove' : 'Removed'} ${removed.length} file(s).`);
      }
    });
}
