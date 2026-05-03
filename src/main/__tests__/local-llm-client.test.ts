import { describe, it, expect, vi } from 'vitest';
import { LocalLlmClient } from '../local-llm-client';
import type { LlamaEngine } from '../node-llama-engine';
import type { ActivityTimeline } from '../timeline-builder';

function mockEngine(responseText: string): LlamaEngine {
  return {
    prompt: vi.fn().mockResolvedValue(responseText),
    getModelName: () => 'llama3.2-3b-test',
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

const validBatchResponse = JSON.stringify({
  summary: 'Edited TypeScript code in Cursor.',
  level2Classification: 'Building',
  driftAssessment: {
    isDrifting: false,
    confidence: 0.9,
    reason: 'Activity matches the stated intention.',
  },
});

const validSessionResponse = JSON.stringify({
  summary: 'Productive coding session in Cursor.',
  focusScore: 78,
});

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
    ],
    startTime: '2026-04-25T10:00:00Z',
    endTime: '2026-04-25T10:03:00Z',
    uniqueApps: ['Cursor'],
    dominantApp: 'Cursor',
  };
}

describe('LocalLlmClient', () => {
  describe('batchSummarize', () => {
    it('returns valid BatchSummaryResult from engine response', async () => {
      const client = new LocalLlmClient(mockEngine(validBatchResponse));
      const result = await client.batchSummarize(sampleTimeline(), 'Build focus tracker');

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Edited TypeScript code in Cursor.');
      expect(result!.level2Classification).toBe('Building');
      expect(result!.driftAssessment.isDrifting).toBe(false);
      expect(result!.driftAssessment.confidence).toBe(0.9);
      expect(result!.usage.inputTokens).toBe(0);
      expect(result!.usage.outputTokens).toBe(0);
    });

    it('sends prompt with timeline data to engine', async () => {
      const engine = mockEngine(validBatchResponse);
      const client = new LocalLlmClient(engine);
      await client.batchSummarize(sampleTimeline(), 'Build focus tracker');

      const prompt = (engine.prompt as any).mock.calls[0][0];
      expect(prompt).toContain('Build focus tracker');
      expect(prompt).toContain('Cursor');
      expect(prompt).toContain('const x = 42;');
    });

    it('returns null when engine returns empty response', async () => {
      const client = new LocalLlmClient(mockEngine(''));
      const result = await client.batchSummarize(sampleTimeline(), 'test');
      expect(result).toBeNull();
    });

    it('returns null when engine returns invalid JSON', async () => {
      const client = new LocalLlmClient(mockEngine('Not JSON at all'));
      const result = await client.batchSummarize(sampleTimeline(), 'test');
      expect(result).toBeNull();
    });

    it('returns null when engine throws', async () => {
      const engine = mockEngine('');
      (engine.prompt as any).mockRejectedValue(new Error('Model crashed'));
      const client = new LocalLlmClient(engine);
      const result = await client.batchSummarize(sampleTimeline(), 'test');
      expect(result).toBeNull();
    });

    it('includes drift guidance in prompt', async () => {
      const engine = mockEngine(validBatchResponse);
      const client = new LocalLlmClient(engine);
      await client.batchSummarize(sampleTimeline(), 'Fix the auth bug');

      const prompt = (engine.prompt as any).mock.calls[0][0];
      expect(prompt).toContain('App-switching speed is NOT a drift signal');
      expect(prompt).toContain('Judge by app and content relevance');
    });
  });

  describe('summarizeSession', () => {
    const activities = [
      { summary: 'Editing focus-tracker.ts', timestamp: '2026-04-25T10:00:00Z', apps: ['Cursor'] },
    ];

    it('returns valid SessionSummaryResult', async () => {
      const client = new LocalLlmClient(mockEngine(validSessionResponse));
      const result = await client.summarizeSession('Build tracker', activities, 25);

      expect(result).not.toBeNull();
      expect(result!.summary).toContain('Productive');
      expect(result!.focusScore).toBe(78);
    });

    it('returns null when engine throws', async () => {
      const engine = mockEngine('');
      (engine.prompt as any).mockRejectedValue(new Error('fail'));
      const client = new LocalLlmClient(engine);
      const result = await client.summarizeSession('test', activities, 25);
      expect(result).toBeNull();
    });
  });

  describe('getLastPrompt', () => {
    it('returns null before any call', () => {
      const client = new LocalLlmClient(mockEngine(validBatchResponse));
      expect(client.getLastPrompt()).toBeNull();
    });

    it('stores the most recent prompt', async () => {
      const client = new LocalLlmClient(mockEngine(validBatchResponse));
      await client.batchSummarize(sampleTimeline(), 'Build tracker');

      const prompt = client.getLastPrompt();
      expect(prompt).toBeTruthy();
      expect(prompt).toContain('Build tracker');
    });
  });

  describe('getModel', () => {
    it('returns engine model name', () => {
      const client = new LocalLlmClient(mockEngine(validBatchResponse));
      expect(client.getModel()).toBe('llama3.2-3b-test');
    });
  });
});
