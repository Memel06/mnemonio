import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectProvider, resolveLlm } from './llm.js';

describe('detectProvider', () => {
  it('detects anthropic from base URL', () => {
    const p = detectProvider('https://api.anthropic.com');
    expect(p.url('https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
    expect(p.headers('sk-test')['x-api-key']).toBe('sk-test');
  });

  it('detects openai from base URL and uses modern provider', () => {
    const p = detectProvider('https://api.openai.com/v1');
    const body = p.body({
      model: 'gpt-4o',
      system: 'sys',
      messages: [],
      maxTokens: 100,
    });
    expect(body).toHaveProperty('max_completion_tokens', 100);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('detects openrouter from base URL and uses classic provider', () => {
    const p = detectProvider('https://api.openrouter.ai/api/v1');
    const body = p.body({
      model: 'auto',
      system: 'sys',
      messages: [],
      maxTokens: 100,
    });
    expect(body).toHaveProperty('max_tokens', 100);
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('defaults to classic provider for unknown URLs', () => {
    const p = detectProvider('http://localhost:8080');
    const body = p.body({
      model: 'local',
      system: 'sys',
      messages: [],
      maxTokens: 50,
    });
    expect(body).toHaveProperty('max_tokens', 50);
  });

  it('respects MNEMONIO_PROVIDER override', () => {
    const p = detectProvider('http://my-proxy.example.com', 'anthropic');
    expect(p.url('http://my-proxy.example.com')).toBe(
      'http://my-proxy.example.com/v1/messages',
    );
  });

  it('allows openai-classic override for older models', () => {
    const p = detectProvider('https://api.openai.com/v1', 'openai-classic');
    const body = p.body({
      model: 'gpt-3.5-turbo',
      system: 'sys',
      messages: [],
      maxTokens: 100,
    });
    expect(body).toHaveProperty('max_tokens', 100);
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('throws on invalid provider override', () => {
    expect(() => detectProvider('http://x.com', 'invalid')).toThrow(
      'Unknown MNEMONIO_PROVIDER',
    );
  });
});

describe('provider body shapes', () => {
  const params = {
    model: 'test-model',
    system: 'You are helpful.',
    messages: [{ role: 'user' as const, content: 'hi' }],
    maxTokens: 256,
  };

  it('openai classic puts system as first message', () => {
    const p = detectProvider('http://localhost:8080');
    const body = p.body(params) as Record<string, unknown>;
    const msgs = body['messages'] as ReadonlyArray<Record<string, string>>;
    expect(msgs[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(msgs[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('anthropic puts system as top-level field', () => {
    const p = detectProvider('https://api.anthropic.com');
    const body = p.body(params) as Record<string, unknown>;
    expect(body['system']).toBe('You are helpful.');
    const msgs = body['messages'] as ReadonlyArray<Record<string, string>>;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({ role: 'user', content: 'hi' });
  });
});

describe('provider response parsing', () => {
  it('parses openai response', () => {
    const p = detectProvider('https://api.openai.com/v1');
    expect(
      p.parseResponse({
        choices: [{ message: { content: 'hello' } }],
      }),
    ).toBe('hello');
  });

  it('parses anthropic response', () => {
    const p = detectProvider('https://api.anthropic.com');
    expect(
      p.parseResponse({
        content: [{ type: 'text', text: 'hello' }],
      }),
    ).toBe('hello');
  });

  it('returns empty string for malformed openai response', () => {
    const p = detectProvider('https://api.openai.com/v1');
    expect(p.parseResponse({})).toBe('');
    expect(p.parseResponse({ choices: [] })).toBe('');
  });

  it('returns empty string for malformed anthropic response', () => {
    const p = detectProvider('https://api.anthropic.com');
    expect(p.parseResponse({})).toBe('');
    expect(p.parseResponse({ content: [] })).toBe('');
  });
});

describe('resolveLlm', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['MNEMONIO_API_KEY'];
    delete process.env['MNEMONIO_BASE_URL'];
    delete process.env['MNEMONIO_MODEL'];
    delete process.env['MNEMONIO_PROVIDER'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns undefined when no API key and not required', () => {
    expect(resolveLlm()).toBeUndefined();
  });

  it('calls process.exit when no API key and required', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    resolveLlm({ required: true });
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('returns a function when API key is present', () => {
    process.env['MNEMONIO_API_KEY'] = 'test-key';
    const cb = resolveLlm();
    expect(typeof cb).toBe('function');
  });
});
