import type { LlmCallback } from '../types.js';
import { resolveLlm } from '../core/llm.js';

export function resolveCliLlm(): LlmCallback {
  const llm = resolveLlm({ required: true });
  return llm!;
}
