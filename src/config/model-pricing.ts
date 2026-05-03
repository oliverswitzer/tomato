export interface ModelPricing {
  id: string;
  inputPer1M: number;
  outputPer1M: number;
}

// Per-million-token pricing (USD) as of 2025-05.
// Only models we'd consider for the batch summarizer belong here.
export const HAIKU_MODELS: ModelPricing[] = [
  { id: 'claude-haiku-4-5-20251001', inputPer1M: 1.00, outputPer1M: 5.00 },
  { id: 'claude-3-5-haiku-20241022', inputPer1M: 1.00, outputPer1M: 5.00 },
  { id: 'claude-3-haiku-20240307',   inputPer1M: 0.25, outputPer1M: 1.25 },
];

// All known Claude models — used to show per-token cost in the model picker.
// Anthropic's /v1/models API does not return pricing, so we maintain this table.
const ALL_MODEL_PRICING: ModelPricing[] = [
  ...HAIKU_MODELS,
  { id: 'claude-sonnet-4-6-20260301', inputPer1M: 3.00, outputPer1M: 15.00 },
  { id: 'claude-sonnet-4-5-20250514', inputPer1M: 3.00, outputPer1M: 15.00 },
  { id: 'claude-3-5-sonnet-20241022', inputPer1M: 3.00, outputPer1M: 15.00 },
  { id: 'claude-3-5-sonnet-20240620', inputPer1M: 3.00, outputPer1M: 15.00 },
  { id: 'claude-opus-4-7-20260414',   inputPer1M: 15.00, outputPer1M: 75.00 },
  { id: 'claude-opus-4-5-20250220',   inputPer1M: 15.00, outputPer1M: 75.00 },
  { id: 'llama3.2:3b', inputPer1M: 0, outputPer1M: 0 },
];

export function getModelPricing(modelId: string): ModelPricing | null {
  return ALL_MODEL_PRICING.find((m) => m.id === modelId) ?? null;
}

export function formatTokenCost(pricing: ModelPricing): string {
  return `$${pricing.inputPer1M}/$${pricing.outputPer1M} per 1M tokens`;
}

export function cheapestHaikuFromList(availableModelIds: string[]): string | null {
  const available = HAIKU_MODELS.filter((m) => availableModelIds.includes(m.id));
  if (available.length === 0) return null;
  available.sort((a, b) => a.inputPer1M + a.outputPer1M - (b.inputPer1M + b.outputPer1M));
  return available[0].id;
}

export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export type PriceTier = '$' | '$$' | '$$$';

export function getPriceTier(modelId: string): PriceTier {
  if (modelId.includes('haiku')) return '$';
  if (modelId.includes('sonnet')) return '$$';
  return '$$$';
}
