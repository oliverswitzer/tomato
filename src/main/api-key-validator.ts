import { cheapestHaikuFromList, DEFAULT_MODEL } from '../config/model-pricing';

export const API_KEY_REGEX = /^sk-ant-[a-zA-Z0-9_-]{20,}$/;

export function isValidKeyFormat(key: string): boolean {
  return API_KEY_REGEX.test(key);
}

export interface ValidationSuccess {
  valid: true;
  selectedModel: string;
}

export interface ValidationError {
  valid: false;
  error: string;
  retryable: boolean;
}

export type ValidationResult = ValidationSuccess | ValidationError;

export async function validateApiKey(
  key: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<ValidationResult> {
  const trimmed = key.trim();

  if (!isValidKeyFormat(trimmed)) {
    return { valid: false, error: 'Invalid key format — expected sk-ant-…', retryable: false };
  }

  let response: Response;
  try {
    response = await fetchFn('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': trimmed,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return {
      valid: false,
      error: "Couldn't reach Anthropic — check your connection.",
      retryable: true,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      valid: false,
      error: "That key didn't work — Anthropic rejected it.",
      retryable: false,
    };
  }

  if (response.status === 429) {
    return {
      valid: false,
      error: 'Anthropic is rate-limiting this key. Try again in a moment.',
      retryable: true,
    };
  }

  if (!response.ok) {
    return {
      valid: false,
      error: `Anthropic returned an unexpected error (${response.status}). Try again.`,
      retryable: true,
    };
  }

  let body: { data?: { id: string }[] };
  try {
    body = await response.json() as { data?: { id: string }[] };
  } catch {
    return {
      valid: false,
      error: 'Unexpected response from Anthropic. Try again.',
      retryable: true,
    };
  }

  const modelIds = (body.data ?? []).map((m) => m.id);
  const selectedModel = cheapestHaikuFromList(modelIds) ?? DEFAULT_MODEL;

  return { valid: true, selectedModel };
}
