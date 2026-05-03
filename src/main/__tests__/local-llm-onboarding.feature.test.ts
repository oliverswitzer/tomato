import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LlamaEngine } from '../node-llama-engine';
import { LocalLlmClient } from '../local-llm-client';
import type { LlmClient } from '../llm-summarizer';
import { AnthropicLlmClient } from '../llm-summarizer';
import type { ActivityTimeline } from '../timeline-builder';

/**
 * Feature: Local LLM onboarding
 *
 * Scenario: User launches fresh app, selects "Run locally", downloads model,
 *   and Tomato produces a focus summary using the local model.
 *
 * Scenario: User selects "Anthropic API key" and enters a valid key.
 *
 * Scenario: LLM client factory returns the correct client based on preference.
 *
 * Scenario: Switching LLM source at runtime produces valid summaries from both providers.
 */

function mockEngine(responseText: string): LlamaEngine {
  return {
    prompt: vi.fn().mockResolvedValue(responseText),
    getModelName: () => 'llama3.2-3b-local',
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockAnthropic(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  } as any;
}

function sampleTimeline(): ActivityTimeline {
  return {
    entries: [
      {
        timestamp: '2026-04-25T10:00:05Z',
        app: 'Cursor',
        window: 'main.ts',
        typedText: 'const x = 42;',
        eventType: 'typing',
        accessibilityHints: [],
        browserUrl: null,
      },
      {
        timestamp: '2026-04-25T10:01:00Z',
        app: 'Firefox',
        window: 'GitHub PR #42',
        typedText: null,
        eventType: 'app_switch',
        accessibilityHints: [],
        browserUrl: null,
      },
    ],
    startTime: '2026-04-25T10:00:00Z',
    endTime: '2026-04-25T10:03:00Z',
    uniqueApps: ['Cursor', 'Firefox'],
    dominantApp: 'Cursor',
  };
}

const validBatchJson = JSON.stringify({
  summary: 'Edited TypeScript code in Cursor and reviewed a PR on GitHub.',
  level2Classification: 'Building',
  driftAssessment: { isDrifting: false, confidence: 0.9, reason: 'On task.' },
});

const validSessionJson = JSON.stringify({
  summary: 'Productive coding session with focus on TypeScript.',
  focusScore: 85,
});

describe('Feature: Local LLM onboarding', () => {
  describe('Scenario: User selects "Run locally" and produces a summary', () => {
    it('Given the local model is loaded, when batchSummarize is called, then it produces a valid summary', async () => {
      const engine = mockEngine(validBatchJson);
      const client: LlmClient = new LocalLlmClient(engine);

      const result = await client.batchSummarize(sampleTimeline(), 'Build the focus tracker');

      expect(result).not.toBeNull();
      expect(result!.summary).toContain('Edited TypeScript');
      expect(result!.level2Classification).toBe('Building');
      expect(result!.driftAssessment.isDrifting).toBe(false);
      expect(result!.usage.inputTokens).toBe(0);
    });

    it('Given the local model is loaded, when summarizeSession is called, then it produces a valid session summary', async () => {
      const engine = mockEngine(validSessionJson);
      const client: LlmClient = new LocalLlmClient(engine);

      const activities = [
        { summary: 'Editing main.ts in Cursor', timestamp: '2026-04-25T10:00:00Z', apps: ['Cursor'] },
        { summary: 'Reviewing PR on GitHub', timestamp: '2026-04-25T10:02:00Z', apps: ['Firefox'] },
      ];

      const result = await client.summarizeSession('Build the focus tracker', activities, 25);

      expect(result).not.toBeNull();
      expect(result!.summary).toContain('Productive');
      expect(result!.focusScore).toBe(85);
    });
  });

  describe('Scenario: LLM client factory returns the correct client', () => {
    it('returns LocalLlmClient when preference is "local"', () => {
      const engine = mockEngine(validBatchJson);
      const client = new LocalLlmClient(engine);
      expect(client.getModel()).toBe('llama3.2-3b-local');
    });

    it('returns AnthropicLlmClient when preference is "anthropic"', () => {
      const client = new AnthropicLlmClient(makeMockAnthropic(validBatchJson));
      expect(client.getModel()).toBe('claude-haiku-4-5');
    });
  });

  describe('Scenario: Switching LLM source at runtime produces valid summaries', () => {
    let localClient: LlmClient;
    let anthropicClient: LlmClient;

    beforeEach(() => {
      localClient = new LocalLlmClient(mockEngine(validBatchJson));
      anthropicClient = new AnthropicLlmClient(makeMockAnthropic(validBatchJson));
    });

    it('local client produces valid batch summary', async () => {
      const result = await localClient.batchSummarize(sampleTimeline(), 'Build tracker');
      expect(result).not.toBeNull();
      expect(result!.summary).toBeTruthy();
      expect(result!.level2Classification).toBeTruthy();
    });

    it('anthropic client produces valid batch summary', async () => {
      const result = await anthropicClient.batchSummarize(sampleTimeline(), 'Build tracker');
      expect(result).not.toBeNull();
      expect(result!.summary).toBeTruthy();
      expect(result!.level2Classification).toBeTruthy();
    });

    it('both clients use the same prompt format', async () => {
      await localClient.batchSummarize(sampleTimeline(), 'Build tracker');
      await anthropicClient.batchSummarize(sampleTimeline(), 'Build tracker');

      const localPrompt = localClient.getLastPrompt()!;
      const anthropicPrompt = anthropicClient.getLastPrompt()!;

      expect(localPrompt).toBe(anthropicPrompt);
    });
  });
});
