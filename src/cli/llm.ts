import type { LlmCallback } from '../types.js';

const DEFAULT_BASE_URL = 'https://api.openrouter.ai/api/v1';
const DEFAULT_MODEL = 'auto';

/**
 * Resolves an LlmCallback from environment variables.
 *
 * Required:
 *   MNEMONIO_API_KEY  -- API key for the LLM provider
 *
 * Optional:
 *   MNEMONIO_BASE_URL -- Chat completions base URL (default: OpenRouter)
 *   MNEMONIO_MODEL    -- Model identifier (default: "auto")
 */
export function resolveCliLlm(): LlmCallback {
  const apiKey = process.env['MNEMONIO_API_KEY'];
  if (!apiKey) {
    console.error(
      'Error: Set MNEMONIO_API_KEY environment variable. Point MNEMONIO_BASE_URL at any chat completions endpoint.',
    );
    process.exit(1);
  }

  const baseUrl = (
    process.env['MNEMONIO_BASE_URL'] ?? DEFAULT_BASE_URL
  ).replace(/\/+$/, '');
  const model = process.env['MNEMONIO_MODEL'] ?? DEFAULT_MODEL;

  return createChatCallback(apiKey, baseUrl, model);
}

function createChatCallback(
  apiKey: string,
  baseUrl: string,
  model: string,
): LlmCallback {
  return async ({ system, messages, maxTokens }) => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      readonly choices: ReadonlyArray<{
        readonly message: { readonly content: string };
      }>;
    };
    return data.choices[0]?.message.content ?? '';
  };
}
