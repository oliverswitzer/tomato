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

export function cheapestHaikuFromList(availableModelIds: string[]): string | null {
  const available = HAIKU_MODELS.filter((m) => availableModelIds.includes(m.id));
  if (available.length === 0) return null;
  available.sort((a, b) => a.inputPer1M + a.outputPer1M - (b.inputPer1M + b.outputPer1M));
  return available[0].id;
}

export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
