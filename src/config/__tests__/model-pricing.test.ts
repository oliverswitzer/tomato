import { describe, it, expect } from 'vitest';
import { cheapestHaikuFromList, HAIKU_MODELS, DEFAULT_MODEL, getPriceTier } from '../model-pricing';

describe('cheapestHaikuFromList', () => {
  it('selects the cheapest Haiku model from available list', () => {
    const available = ['claude-haiku-4-5-20251001', 'claude-3-haiku-20240307'];
    expect(cheapestHaikuFromList(available)).toBe('claude-3-haiku-20240307');
  });

  it('returns null when no Haiku models are available', () => {
    expect(cheapestHaikuFromList(['claude-sonnet-4-5-20250514'])).toBeNull();
  });

  it('returns the only available Haiku model', () => {
    expect(cheapestHaikuFromList(['claude-haiku-4-5-20251001'])).toBe('claude-haiku-4-5-20251001');
  });

  it('handles empty list', () => {
    expect(cheapestHaikuFromList([])).toBeNull();
  });

  it('all known Haiku models are in the pricing table', () => {
    expect(HAIKU_MODELS.length).toBeGreaterThanOrEqual(1);
    for (const m of HAIKU_MODELS) {
      expect(m.inputPer1M).toBeGreaterThan(0);
      expect(m.outputPer1M).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_MODEL is a known Haiku model', () => {
    expect(HAIKU_MODELS.some((m) => m.id === DEFAULT_MODEL)).toBe(true);
  });
});

describe('getPriceTier', () => {
  it('returns $ for haiku models', () => {
    expect(getPriceTier('claude-haiku-4-5-20251001')).toBe('$');
    expect(getPriceTier('claude-3-haiku-20240307')).toBe('$');
  });

  it('returns $$ for sonnet models', () => {
    expect(getPriceTier('claude-sonnet-4-6-20260301')).toBe('$$');
    expect(getPriceTier('claude-3-5-sonnet-20241022')).toBe('$$');
  });

  it('returns $$$ for opus and unknown models', () => {
    expect(getPriceTier('claude-opus-4-7-20260301')).toBe('$$$');
    expect(getPriceTier('claude-unknown-model')).toBe('$$$');
  });
});
