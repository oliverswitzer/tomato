import { describe, it, expect, vi } from 'vitest';
import { LocalLlmClient } from '../local-llm-client';
import type { ActivityTimeline } from '../timeline-builder';

const validBatchResponse = JSON.stringify({
  summary: 'Edited TypeScript code in Cursor and reviewed a PR on GitHub.',
  level2Classification: 'Building',
  driftAssessment: {
    isDrifting: false,
    confidence: 0.9,
    reason: 'Activity matches the stated intention.',
  },
});

const validSessionResponse = JSON.stringify({
  summary: 'Wrote TypeScript code in Cursor for the focus tracker, then briefly checked Messages.',
  focusScore: 78,
});

function makeMockFetch(responseText: string, options: { status?: number; ok?: boolean } = {}) {
  const status = options.status ?? 200;
  const ok = options.ok ?? status < 400;
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue({
      choices: [{ message: { content: responseText } }],
      usage: { prompt_tokens: 400, completion_tokens: 90 },
    }),
  });
}

function sampleTimeline(overrides: Partial<ActivityTimeline> = {}): ActivityTimeline {
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
        window: 'GitHub',
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
    ...overrides,
  };
}

describe('LocalLlmClient', () => {
  describe('batchSummarize', () => {
    it('sends prompt with timeline entries and intention to Ollama endpoint', async () => {
      const fetchFn = makeMockFetch(validBatchResponse);
      const client = new LocalLlmClient({ fetchFn });

      await client.batchSummarize(sampleTimeline(), 'Build the focus tracker');

      expect(fetchFn).toHaveBeenCalledOnce();
      const [url, options] = fetchFn.mock.calls[0];
      expect(url).toBe('http://localhost:11434/v1/chat/completions');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('llama3.2:3b');
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toContain('Build the focus tracker');
      expect(body.messages[0].content).toContain('Cursor');
      expect(body.messages[0].content).toContain('const x = 42;');
      expect(body.messages[0].content).toContain('main.ts');
      expect(body.messages[0].content).toContain('switched to this app');
    });

    it('parses valid JSON response into BatchSummaryResult', async () => {
      const client = new LocalLlmClient({ fetchFn: makeMockFetch(validBatchResponse) });

      const result = await client.batchSummarize(sampleTimeline(), 'Build it');

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Edited TypeScript code in Cursor and reviewed a PR on GitHub.');
      expect(result!.level2Classification).toBe('Building');
      expect(result!.driftAssessment.isDrifting).toBe(false);
      expect(result!.driftAssessment.confidence).toBe(0.9);
      expect(result!.usage.inputTokens).toBe(400);
      expect(result!.usage.outputTokens).toBe(90);
    });

    it('returns null when fetch throws (server down)', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error('Connection refused'));
      const client = new LocalLlmClient({ fetchFn });

      const result = await client.batchSummarize(sampleTimeline(), 'test');
      expect(result).toBeNull();
    });

    it('returns null on malformed JSON response', async () => {
      const client = new LocalLlmClient({ fetchFn: makeMockFetch('This is not JSON at all') });

      const result = await client.batchSummarize(sampleTimeline(), 'test');
      expect(result).toBeNull();
    });

    it('returns null when response JSON is missing required fields', async () => {
      const client = new LocalLlmClient({
        fetchFn: makeMockFetch(JSON.stringify({ summary: 'hello' })),
      });

      const result = await client.batchSummarize(sampleTimeline(), 'test');
      expect(result).toBeNull();
    });

    it('getLastPrompt stores the most recent prompt', async () => {
      const client = new LocalLlmClient({ fetchFn: makeMockFetch(validBatchResponse) });

      expect(client.getLastPrompt()).toBeNull();
      await client.batchSummarize(sampleTimeline(), 'Build focus tracker');
      expect(client.getLastPrompt()).toContain('Build focus tracker');
    });

    it('prompt contains identical drift guidance as AnthropicLlmClient', async () => {
      const fetchFn = makeMockFetch(validBatchResponse);
      const client = new LocalLlmClient({ fetchFn });

      await client.batchSummarize(sampleTimeline(), 'Fix the auth bug');

      const body = JSON.parse(fetchFn.mock.calls[0][1].body);
      const prompt = body.messages[0].content;
      expect(prompt).toContain('App-switching speed is NOT a drift signal');
      expect(prompt).toContain('Judge by app and content relevance');
      expect(prompt).toContain('Flag drift only when apps are clearly unrelated');
      expect(prompt).toContain('False positives');
    });
  });

  describe('summarizeSession', () => {
    const activities = [
      { summary: 'Editing focus-tracker.ts', timestamp: '2026-04-25T10:00:00Z', apps: ['Cursor'] },
      { summary: 'Texting in Messages', timestamp: '2026-04-25T10:05:00Z', apps: ['Messages'] },
      { summary: 'Back to coding', timestamp: '2026-04-25T10:07:00Z', apps: ['Cursor'] },
    ];

    it('returns summary and focus score', async () => {
      const client = new LocalLlmClient({ fetchFn: makeMockFetch(validSessionResponse) });
      const result = await client.summarizeSession('Build focus tracker', activities, 25);

      expect(result).not.toBeNull();
      expect(result!.summary).toContain('TypeScript');
      expect(result!.focusScore).toBe(78);
    });

    it('clamps focus score to 0-100', async () => {
      const client = new LocalLlmClient({
        fetchFn: makeMockFetch(JSON.stringify({ summary: 'test', focusScore: 150 })),
      });
      const result = await client.summarizeSession('test', activities, 25);
      expect(result!.focusScore).toBe(100);
    });

    it('returns null when fetch throws (server down)', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error('Connection refused'));
      const client = new LocalLlmClient({ fetchFn });
      const result = await client.summarizeSession('test', activities, 25);
      expect(result).toBeNull();
    });
  });
});
