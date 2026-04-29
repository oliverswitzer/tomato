import { describe, it, expect, vi } from 'vitest';
import { isValidKeyFormat, validateApiKey } from '../api-key-validator';

describe('isValidKeyFormat', () => {
  it('accepts a valid sk-ant- key with sufficient length', () => {
    expect(isValidKeyFormat('sk-ant-abcdef1234567890ABCDEF')).toBe(true);
  });

  it('accepts keys with hyphens and underscores', () => {
    expect(isValidKeyFormat('sk-ant-abc_def-12345678901234')).toBe(true);
  });

  it('rejects key with wrong prefix', () => {
    expect(isValidKeyFormat('sk-wrong-abcdef1234567890ABCDE')).toBe(false);
  });

  it('rejects key that is too short', () => {
    expect(isValidKeyFormat('sk-ant-short')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidKeyFormat('')).toBe(false);
  });

  it('rejects key with special characters', () => {
    expect(isValidKeyFormat('sk-ant-abc!@#$%^&*()12345678')).toBe(false);
  });
});

describe('validateApiKey', () => {
  const validKey = 'sk-ant-abcdef1234567890ABCDEF';

  it('rejects invalid format without making network call', async () => {
    const fetchFn = vi.fn();
    const result = await validateApiKey('bad-key', fetchFn);

    expect(result.valid).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns success and selects cheapest Haiku on 200', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: [
          { id: 'claude-3-haiku-20240307' },
          { id: 'claude-haiku-4-5-20251001' },
          { id: 'claude-sonnet-4-5-20250514' },
        ],
      }),
    });

    const result = await validateApiKey(validKey, fetchFn);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.selectedModel).toBe('claude-3-haiku-20240307');
    }
  });

  it('returns auth error on 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    const result = await validateApiKey(validKey, fetchFn);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("didn't work");
      expect(result.retryable).toBe(false);
    }
  });

  it('returns rate limit error on 429', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });

    const result = await validateApiKey(validKey, fetchFn);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('rate-limiting');
      expect(result.retryable).toBe(true);
    }
  });

  it('returns network error when fetch throws', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network error'));

    const result = await validateApiKey(validKey, fetchFn);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('connection');
      expect(result.retryable).toBe(true);
    }
  });

  it('trims whitespace from key before validating', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ id: 'claude-haiku-4-5-20251001' }] }),
    });

    const result = await validateApiKey(`  ${validKey}  \n`, fetchFn);
    expect(result.valid).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': validKey }),
      }),
    );
  });

  it('uses default model when no Haiku variants in model list', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: [{ id: 'claude-sonnet-4-5-20250514' }],
      }),
    });

    const result = await validateApiKey(validKey, fetchFn);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.selectedModel).toBe('claude-haiku-4-5-20251001');
    }
  });

  it('returns auth error on 403', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });

    const result = await validateApiKey(validKey, fetchFn);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("didn't work");
    }
  });
});
