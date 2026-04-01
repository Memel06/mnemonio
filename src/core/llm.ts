import type { LlmCallback } from '../types.js';

interface LlmProvider {
  readonly url: (baseUrl: string) => string;
  readonly headers: (apiKey: string) => Readonly<Record<string, string>>;
  readonly body: (params: {
    readonly model: string;
    readonly system: string;
    readonly messages: ReadonlyArray<{
      readonly role: 'user' | 'assistant';
      readonly content: string;
    }>;
    readonly maxTokens: number;
  }) => Record<string, unknown>;
  readonly parseResponse: (data: unknown) => string;
}

// -- providers --

const openaiClassicProvider: LlmProvider = {
  url: (baseUrl) => `${baseUrl}/chat/completions`,
  headers: (apiKey) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }),
  body: ({ model, system, messages, maxTokens }) => ({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, ...messages],
  }),
  parseResponse: (data) => {
    const d = data as {
      readonly choices?: ReadonlyArray<{
        readonly message?: { readonly content?: string };
      }>;
    };
    return d.choices?.[0]?.message?.content ?? '';
  },
};

const openaiModernProvider: LlmProvider = {
  ...openaiClassicProvider,
  body: ({ model, system, messages, maxTokens }) => ({
    model,
    max_completion_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, ...messages],
  }),
};

const anthropicProvider: LlmProvider = {
  url: (baseUrl) => `${baseUrl}/v1/messages`,
  headers: (apiKey) => ({
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }),
  body: ({ model, system, messages, maxTokens }) => ({
    model,
    system,
    max_tokens: maxTokens,
    messages: [...messages],
  }),
  parseResponse: (data) => {
    const d = data as {
      readonly content?: ReadonlyArray<{ readonly text?: string }>;
    };
    return d.content?.[0]?.text ?? '';
  },
};

type ProviderName = 'openai' | 'openai-classic' | 'anthropic' | 'openrouter';

const PROVIDERS: Readonly<Record<ProviderName, LlmProvider>> = {
  openai: openaiModernProvider,
  'openai-classic': openaiClassicProvider,
  anthropic: anthropicProvider,
  openrouter: openaiClassicProvider,
};

function isProviderName(value: string): value is ProviderName {
  return value in PROVIDERS;
}

export function detectProvider(
  baseUrl: string,
  override?: string,
): LlmProvider {
  if (override) {
    const key = override.toLowerCase();
    if (isProviderName(key)) return PROVIDERS[key];
    throw new Error(
      `Unknown MNEMONIO_PROVIDER: "${override}". Valid values: ${Object.keys(PROVIDERS).join(', ')}`,
    );
  }

  const host = baseUrl.toLowerCase();
  if (host.includes('anthropic.com')) return anthropicProvider;
  if (host.includes('openai.com')) return openaiModernProvider;
  if (host.includes('openrouter.ai')) return openaiClassicProvider;
  return openaiClassicProvider;
}

const DEFAULT_BASE_URL = 'https://api.openrouter.ai/api/v1';
const DEFAULT_MODEL = 'auto';

export function resolveLlm(opts?: {
  readonly required?: boolean;
}): LlmCallback | undefined {
  const apiKey = process.env['MNEMONIO_API_KEY'];
  if (!apiKey) {
    if (opts?.required) {
      throw new Error(
        'MNEMONIO_API_KEY not set. Set the environment variable and point MNEMONIO_BASE_URL at any chat completions endpoint.',
      );
    }
    return undefined;
  }

  const baseUrl = (
    process.env['MNEMONIO_BASE_URL'] ?? DEFAULT_BASE_URL
  ).replace(/\/+$/, '');
  const model = process.env['MNEMONIO_MODEL'] ?? DEFAULT_MODEL;
  const provider = detectProvider(baseUrl, process.env['MNEMONIO_PROVIDER']);

  return async ({ system, messages, maxTokens }) => {
    const response = await fetch(provider.url(baseUrl), {
      method: 'POST',
      headers: provider.headers(apiKey),
      body: JSON.stringify(
        provider.body({ model, system, messages, maxTokens }),
      ),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM API error ${response.status}: ${text}`);
    }

    const data: unknown = await response.json();
    return provider.parseResponse(data);
  };
}
