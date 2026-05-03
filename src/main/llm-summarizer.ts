import type Anthropic from '@anthropic-ai/sdk';
import type { ActivityTimeline } from './timeline-builder';
import { buildBatchPrompt, buildSessionPrompt, parseBatchResponse, parseSessionResponse } from './llm-prompts';

export class LlmAuthError extends Error {
  constructor(message = 'API key rejected') {
    super(message);
    this.name = 'LlmAuthError';
  }
}

export class LlmModelNotFoundError extends Error {
  constructor(public model: string, message = 'Model not found') {
    super(message);
    this.name = 'LlmModelNotFoundError';
  }
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface BatchSummaryResult {
  summary: string;
  level2Classification: string;
  driftAssessment: {
    isDrifting: boolean;
    confidence: number;
    reason: string;
  };
  usage: TokenUsage;
}

export interface SessionSummaryResult {
  summary: string;
  focusScore: number;
}

export interface LlmClient {
  batchSummarize(
    timeline: ActivityTimeline,
    intention: string,
    sessionContext?: { durationMin: number; batchWindowSec: number },
  ): Promise<BatchSummaryResult | null>;
  summarizeSession(
    intention: string,
    activities: { summary: string; timestamp: string; apps: string[] }[],
    durationMin: number,
  ): Promise<SessionSummaryResult | null>;
  getLastPrompt(): string | null;
  getModel(): string;
  setModel?(model: string): void;
}

export class AnthropicLlmClient implements LlmClient {
  private lastPrompt: string | null = null;

  constructor(private anthropic: Anthropic, private model: string = 'claude-haiku-4-5') {}

  setModel(model: string): void {
    this.model = model;
  }

  async batchSummarize(
    timeline: ActivityTimeline,
    intention: string,
    sessionContext?: { durationMin: number; batchWindowSec: number },
  ): Promise<BatchSummaryResult | null> {
    const prompt = buildBatchPrompt({ timeline, intention, sessionContext });
    this.lastPrompt = prompt;

    try {
      const res = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });

      const block = res.content.find((b) => b.type === 'text');
      if (!block || block.type !== 'text') return null;

      const usage: TokenUsage = {
        inputTokens: res.usage?.input_tokens ?? 0,
        outputTokens: res.usage?.output_tokens ?? 0,
      };

      const parsed = parseBatchResponse(block.text);
      if (!parsed) return null;

      return { ...parsed, usage };
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode;
      if (status === 401 || status === 403) throw new LlmAuthError(err.message);
      if (status === 404) throw new LlmModelNotFoundError(this.model, err.message);
      return null;
    }
  }

  getLastPrompt(): string | null {
    return this.lastPrompt;
  }

  getModel(): string {
    return this.model;
  }

  async summarizeSession(
    intention: string,
    activities: { summary: string; timestamp: string; apps: string[] }[],
    durationMin: number,
  ): Promise<SessionSummaryResult | null> {
    const prompt = buildSessionPrompt(intention, activities, durationMin);
    this.lastPrompt = prompt;

    try {
      const res = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });

      const block = res.content.find((b) => b.type === 'text');
      if (!block || block.type !== 'text') return null;

      return parseSessionResponse(block.text);
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode;
      if (status === 401 || status === 403) throw new LlmAuthError(err.message);
      if (status === 404) throw new LlmModelNotFoundError(this.model, err.message);
      return null;
    }
  }
}
