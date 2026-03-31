import type { MnemonioConfig } from '../types.js';
import { buildMemoryPrompt } from './individual.js';
import { scanMemoryFiles, formatMemoryManifest } from '../core/scan.js';

export async function buildCombinedPrompt(config: MnemonioConfig): Promise<string> {
  const privatePrompt = await buildMemoryPrompt(config);

  if (!config.teamDir) {
    return privatePrompt;
  }

  const teamHeaders = await scanMemoryFiles(config.teamDir);
  if (teamHeaders.length === 0) {
    return privatePrompt;
  }

  const teamManifest = formatMemoryManifest(teamHeaders, config.teamDir);
  const teamSection = [
    '',
    '## Team Memory (shared, read-only)',
    '',
    teamManifest,
    '',
    'Team memories are shared. Do not modify them directly.',
    '',
  ].join('\n');

  return privatePrompt + teamSection;
}
