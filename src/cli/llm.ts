import type { LlmCallback } from '../types.js';
import { resolveLlm } from '../core/llm.js';

export function resolveCliLlm(): LlmCallback {
  try {
    const llm = resolveLlm({ required: true });
    return llm!;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
