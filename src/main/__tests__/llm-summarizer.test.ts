import { describe, it, expect, vi } from 'vitest';
import { AnthropicLlmClient } from '../llm-summarizer';
import type { ActivityTimeline } from '../timeline-builder';

function makeMockAnthropic(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
      }),
    },
  } as any;
}

const validResponse = JSON.stringify({
  summary: 'Edited TypeScript code in Cursor and reviewed a PR on GitHub.',
  level2Classification: 'Building',
  driftAssessment: {
    isDrifting: false,
    confidence: 0.9,
    reason: 'Activity matches the stated intention.',
  },
});

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

describe('AnthropicLlmClient', () => {
  describe('batchSummarize', () => {
    it('sends prompt with timeline entries and intention', async () => {
      const anthropic = makeMockAnthropic(validResponse);
      const client = new AnthropicLlmClient(anthropic);

      await client.batchSummarize(sampleTimeline(), 'Build the focus tracker');

      const prompt = anthropic.messages.create.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('Build the focus tracker');
      expect(prompt).toContain('Cursor');
      expect(prompt).toContain('const x = 42;');
      expect(prompt).toContain('main.ts');
      expect(prompt).toContain('switched to this app');
    });

    it('parses valid JSON response into BatchSummaryResult', async () => {
      const client = new AnthropicLlmClient(makeMockAnthropic(validResponse));

      const result = await client.batchSummarize(sampleTimeline(), 'Build it');

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Edited TypeScript code in Cursor and reviewed a PR on GitHub.');
      expect(result!.level2Classification).toBe('Building');
      expect(result!.driftAssessment.isDrifting).toBe(false);
      expect(result!.driftAssessment.confidence).toBe(0.9);
    });

    it('returns null on LLM API failure', async () => {
      const anthropic = {
        messages: { create: vi.fn().mockRejectedValue(new Error('API error')) },
      } as any;
      const client = new AnthropicLlmClient(anthropic);

      const result = await client.batchSummarize(sampleTimeline(), 'test');
      expect(result).toBeNull();
    });

    it('returns null on malformed JSON response', async () => {
      const client = new AnthropicLlmClient(
        makeMockAnthropic('This is not JSON at all'),
      );

      const result = await client.batchSummarize(sampleTimeline(), 'test');
      expect(result).toBeNull();
    });

    it('returns null when response JSON is missing required fields', async () => {
      const client = new AnthropicLlmClient(
        makeMockAnthropic(JSON.stringify({ summary: 'hello' })),
      );

      const result = await client.batchSummarize(sampleTimeline(), 'test');
      expect(result).toBeNull();
    });

    it('handles empty timeline', async () => {
      const anthropic = makeMockAnthropic(validResponse);
      const client = new AnthropicLlmClient(anthropic);

      await client.batchSummarize(
        sampleTimeline({ entries: [], uniqueApps: [], dominantApp: '' }),
        'test',
      );

      const prompt = anthropic.messages.create.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('No activity detected');
    });

    it('getLastPrompt returns the most recent prompt', async () => {
      const client = new AnthropicLlmClient(makeMockAnthropic(validResponse));

      expect(client.getLastPrompt()).toBeNull();

      await client.batchSummarize(sampleTimeline(), 'Build focus tracker');

      const prompt = client.getLastPrompt();
      expect(prompt).toBeTruthy();
      expect(prompt).toContain('Build focus tracker');
    });

    it('extracts JSON from response with surrounding text', async () => {
      const client = new AnthropicLlmClient(
        makeMockAnthropic(`Here is the analysis:\n${validResponse}\nDone.`),
      );

      const result = await client.batchSummarize(sampleTimeline(), 'test');
      expect(result).not.toBeNull();
      expect(result!.summary).toContain('Edited TypeScript');
    });
  });
});
