import type { ActivityTimeline } from './timeline-builder';
import type { LlmClient, BatchSummaryResult, SessionSummaryResult, TokenUsage } from './llm-summarizer';
import type { LlamaEngine } from './node-llama-engine';
import { buildBatchPrompt, buildSessionPrompt, parseBatchResponse, parseSessionResponse } from './llm-prompts';

export class LocalLlmClient implements LlmClient {
  private engine: LlamaEngine;
  private lastPrompt: string | null = null;

  constructor(engine: LlamaEngine) {
    this.engine = engine;
  }

  async batchSummarize(
    timeline: ActivityTimeline,
    intention: string,
    sessionContext?: { durationMin: number; batchWindowSec: number },
  ): Promise<BatchSummaryResult | null> {
    const prompt = buildBatchPrompt({ timeline, intention, sessionContext });
    this.lastPrompt = prompt;

    try {
      const content = await this.engine.prompt(prompt);
      if (!content) return null;

      const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      const parsed = parseBatchResponse(content);
      if (!parsed) return null;

      return { ...parsed, usage };
    } catch {
      return null;
    }
  }

  async summarizeSession(
    intention: string,
    activities: { summary: string; timestamp: string; apps: string[] }[],
    durationMin: number,
  ): Promise<SessionSummaryResult | null> {
    const prompt = buildSessionPrompt(intention, activities, durationMin);
    this.lastPrompt = prompt;

    try {
      const content = await this.engine.prompt(prompt);
      if (!content) return null;

      return parseSessionResponse(content);
    } catch {
      return null;
    }
  }

  getLastPrompt(): string | null {
    return this.lastPrompt;
  }

  getModel(): string {
    return this.engine.getModelName();
  }

  setModel(): void {
    // local model is set at startup, not swappable at runtime
  }

  async dispose(): Promise<void> {
    await this.engine.dispose();
  }
}
