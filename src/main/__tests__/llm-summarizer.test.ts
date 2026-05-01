import { describe, it, expect, vi } from 'vitest';
import { AnthropicLlmClient, LlmAuthError, LlmModelNotFoundError } from '../llm-summarizer';
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

    it('prompt includes drift guidance about app-switching and relevance', async () => {
      const anthropic = makeMockAnthropic(validResponse);
      const client = new AnthropicLlmClient(anthropic);

      await client.batchSummarize(sampleTimeline(), 'Fix the auth bug');

      const prompt = anthropic.messages.create.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('App-switching speed is NOT a drift signal');
      expect(prompt).toContain('Judge by app and content relevance');
      expect(prompt).toContain('Flag drift only when apps are clearly unrelated');
      expect(prompt).toContain('False positives');
    });

    it('does not flag browsing a related GitHub PR as drift', async () => {
      const driftResponse = JSON.stringify({
        summary: 'Reviewed a GitHub PR about auth middleware and edited auth code in Cursor.',
        level2Classification: 'Building',
        driftAssessment: {
          isDrifting: false,
          confidence: 0.85,
          reason: 'GitHub PR review is directly related to fixing the auth bug.',
        },
      });
      const client = new AnthropicLlmClient(makeMockAnthropic(driftResponse));

      const timeline = sampleTimeline({
        entries: [
          {
            timestamp: '2026-04-25T10:00:05Z',
            app: 'Cursor',
            window: 'auth-middleware.ts',
            typedText: 'if (!token) throw',
            eventType: 'typing',
            accessibilityHints: [],
            browserUrl: null,
          },
          {
            timestamp: '2026-04-25T10:00:12Z',
            app: 'Chrome',
            window: 'Fix auth token validation · Pull Request #42',
            typedText: null,
            eventType: 'app_switch',
            accessibilityHints: [],
            browserUrl: null,
          },
          {
            timestamp: '2026-04-25T10:00:18Z',
            app: 'Cursor',
            window: 'auth-middleware.ts',
            typedText: null,
            eventType: 'app_switch',
            accessibilityHints: [],
            browserUrl: null,
          },
          {
            timestamp: '2026-04-25T10:00:22Z',
            app: 'Chrome',
            window: 'Fix auth token validation · Pull Request #42',
            typedText: null,
            eventType: 'app_switch',
            accessibilityHints: [],
            browserUrl: null,
          },
        ],
        uniqueApps: ['Cursor', 'Chrome'],
        dominantApp: 'Cursor',
      });

      const result = await client.batchSummarize(timeline, 'Fix the auth bug');
      expect(result).not.toBeNull();
      expect(result!.driftAssessment.isDrifting).toBe(false);
    });

    it('does not flag reading docs as drift when implementing a feature', async () => {
      const docsResponse = JSON.stringify({
        summary: 'Read React documentation on useEffect and edited UserSettings component.',
        level2Classification: 'Research',
        driftAssessment: {
          isDrifting: false,
          confidence: 0.9,
          reason: 'Reading React docs is directly relevant to implementing user settings.',
        },
      });
      const client = new AnthropicLlmClient(makeMockAnthropic(docsResponse));

      const timeline = sampleTimeline({
        entries: [
          {
            timestamp: '2026-04-25T10:00:05Z',
            app: 'Chrome',
            window: 'useEffect – React',
            typedText: null,
            eventType: 'app_switch',
            accessibilityHints: [],
            browserUrl: null,
          },
          {
            timestamp: '2026-04-25T10:00:30Z',
            app: 'VS Code',
            window: 'UserSettings.tsx',
            typedText: 'useEffect(() => {',
            eventType: 'typing',
            accessibilityHints: [],
            browserUrl: null,
          },
        ],
        uniqueApps: ['Chrome', 'VS Code'],
        dominantApp: 'VS Code',
      });

      const result = await client.batchSummarize(timeline, 'Implement user settings page');
      expect(result).not.toBeNull();
      expect(result!.driftAssessment.isDrifting).toBe(false);
    });

    it('does not flag Stack Overflow research as drift when debugging', async () => {
      const soResponse = JSON.stringify({
        summary: 'Searched Stack Overflow for API timeout solutions and tested fixes in Cursor.',
        level2Classification: 'Research',
        driftAssessment: {
          isDrifting: false,
          confidence: 0.85,
          reason: 'Stack Overflow research on timeout issues is directly related to debugging the API timeout.',
        },
      });
      const client = new AnthropicLlmClient(makeMockAnthropic(soResponse));

      const timeline = sampleTimeline({
        entries: [
          {
            timestamp: '2026-04-25T10:00:05Z',
            app: 'Chrome',
            window: 'node.js - How to handle API request timeout - Stack Overflow',
            typedText: null,
            eventType: 'app_switch',
            accessibilityHints: [],
            browserUrl: null,
          },
          {
            timestamp: '2026-04-25T10:00:20Z',
            app: 'Cursor',
            window: 'api-client.ts',
            typedText: 'timeout: 30000',
            eventType: 'typing',
            accessibilityHints: [],
            browserUrl: null,
          },
        ],
        uniqueApps: ['Chrome', 'Cursor'],
        dominantApp: 'Cursor',
      });

      const result = await client.batchSummarize(timeline, 'Debug API timeout issue');
      expect(result).not.toBeNull();
      expect(result!.driftAssessment.isDrifting).toBe(false);
    });

    it('correctly flags watching YouTube entertainment as drift', async () => {
      const ytResponse = JSON.stringify({
        summary: 'Watched a music video on YouTube instead of working on the auth bug.',
        level2Classification: 'Off-task',
        driftAssessment: {
          isDrifting: true,
          confidence: 0.9,
          reason: 'Watching entertainment videos is unrelated to fixing the auth bug.',
        },
      });
      const client = new AnthropicLlmClient(makeMockAnthropic(ytResponse));

      const timeline = sampleTimeline({
        entries: [
          {
            timestamp: '2026-04-25T10:00:05Z',
            app: 'Chrome',
            window: 'Daft Punk - Get Lucky (Official Video) - YouTube',
            typedText: null,
            eventType: 'app_switch',
            accessibilityHints: [],
            browserUrl: null,
          },
        ],
        uniqueApps: ['Chrome'],
        dominantApp: 'Chrome',
      });

      const result = await client.batchSummarize(timeline, 'Fix the auth bug');
      expect(result).not.toBeNull();
      expect(result!.driftAssessment.isDrifting).toBe(true);
      expect(result!.driftAssessment.confidence).toBeGreaterThanOrEqual(0.6);
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

    it('includes browserUrl in prompt when present', async () => {
      const anthropic = makeMockAnthropic(validResponse);
      const client = new AnthropicLlmClient(anthropic);

      const timeline = sampleTimeline({
        entries: [
          {
            timestamp: '2026-04-25T10:00:05Z',
            app: 'Google Chrome',
            window: 'Stack Overflow',
            typedText: 'how to fix bug',
            eventType: 'typing',
            accessibilityHints: [],
            browserUrl: 'https://stackoverflow.com/questions/123',
          },
        ],
      });

      await client.batchSummarize(timeline, 'Fix the login bug');

      const prompt = anthropic.messages.create.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('url: https://stackoverflow.com/questions/123');
    });

    it('omits browserUrl from prompt when null', async () => {
      const anthropic = makeMockAnthropic(validResponse);
      const client = new AnthropicLlmClient(anthropic);

      await client.batchSummarize(sampleTimeline(), 'Build the focus tracker');

      const prompt = anthropic.messages.create.mock.calls[0][0].messages[0].content;
      expect(prompt).not.toContain('url:');
    });

    it('includes passive context section in prompt when entries have passive context', async () => {
      const anthropic = makeMockAnthropic(validResponse);
      const client = new AnthropicLlmClient(anthropic);

      const timeline = sampleTimeline({
        entries: [
          {
            timestamp: '2026-04-25T10:00:05Z',
            app: 'Google Chrome',
            window: 'How i book 3-5 meetings a day Cold Calling - YouTube - Audio playing - Google Chrome - Oliver',
            typedText: null,
            eventType: 'passive',
            accessibilityHints: [],
            browserUrl: 'https://www.youtube.com/watch?v=tU52nLIUz8Y',
            passiveContext: {
              urls: ['https://www.youtube.com/watch?v=tU52nLIUz8Y'],
              screenText: 'How i book 3-5 meetings a day\nCold Calling ($319,000/month web design agency - full script)\nChrome File Edit View',
              clickTargets: ['Start 25-minute session', 'Refocus'],
            },
          },
        ],
      });

      await client.batchSummarize(timeline, 'Build an API');

      const prompt = anthropic.messages.create.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('Passive Context');
      expect(prompt).toContain('URLs visited: https://www.youtube.com/watch?v=tU52nLIUz8Y');
      expect(prompt).toContain('Screen text: How i book 3-5 meetings a day');
      expect(prompt).toContain('Click targets: Start 25-minute session, Refocus');
    });

    it('includes anti-hallucination instruction in prompt', async () => {
      const anthropic = makeMockAnthropic(validResponse);
      const client = new AnthropicLlmClient(anthropic);

      await client.batchSummarize(sampleTimeline(), 'Build the focus tracker');

      const prompt = anthropic.messages.create.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('Do not infer or fabricate video titles, article names, or page content that is not explicitly shown');
    });

    it('marks passive entries with passive consumption label in prompt', async () => {
      const anthropic = makeMockAnthropic(validResponse);
      const client = new AnthropicLlmClient(anthropic);

      const timeline = sampleTimeline({
        entries: [
          {
            timestamp: '2026-04-25T10:00:05Z',
            app: 'Google Chrome',
            window: 'Opening soon… - YouTube - Audio playing - Google Chrome - Oliver',
            typedText: null,
            eventType: 'passive',
            accessibilityHints: [],
            browserUrl: null,
          },
        ],
      });

      await client.batchSummarize(timeline, 'Build it');

      const prompt = anthropic.messages.create.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('passive consumption');
    });

    it('omits passive context section when no passive data exists', async () => {
      const anthropic = makeMockAnthropic(validResponse);
      const client = new AnthropicLlmClient(anthropic);

      await client.batchSummarize(sampleTimeline(), 'Build the focus tracker');

      const prompt = anthropic.messages.create.mock.calls[0][0].messages[0].content;
      expect(prompt).not.toContain('Passive Context');
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

  describe('summarizeSession', () => {
    const sessionResponse = JSON.stringify({
      summary: 'Wrote TypeScript code in Cursor for the focus tracker, then briefly checked Messages.',
      focusScore: 78,
    });

    const activities = [
      { summary: 'Editing focus-tracker.ts', timestamp: '2026-04-25T10:00:00Z', apps: ['Cursor'] },
      { summary: 'Texting in Messages', timestamp: '2026-04-25T10:05:00Z', apps: ['Messages'] },
      { summary: 'Back to coding', timestamp: '2026-04-25T10:07:00Z', apps: ['Cursor'] },
    ];

    it('returns summary and focus score', async () => {
      const client = new AnthropicLlmClient(makeMockAnthropic(sessionResponse));
      const result = await client.summarizeSession('Build focus tracker', activities, 25);

      expect(result).not.toBeNull();
      expect(result!.summary).toContain('TypeScript');
      expect(result!.focusScore).toBe(78);
    });

    it('clamps focus score to 0-100', async () => {
      const client = new AnthropicLlmClient(
        makeMockAnthropic(JSON.stringify({ summary: 'test', focusScore: 150 })),
      );
      const result = await client.summarizeSession('test', activities, 25);
      expect(result!.focusScore).toBe(100);
    });

    it('returns null on API failure', async () => {
      const anthropic = { messages: { create: vi.fn().mockRejectedValue(new Error('fail')) } } as any;
      const client = new AnthropicLlmClient(anthropic);
      const result = await client.summarizeSession('test', activities, 25);
      expect(result).toBeNull();
    });

    it('prompt contains intention and activity log', async () => {
      const anthropic = makeMockAnthropic(sessionResponse);
      const client = new AnthropicLlmClient(anthropic);
      await client.summarizeSession('Build focus tracker', activities, 25);

      const prompt = anthropic.messages.create.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('Build focus tracker');
      expect(prompt).toContain('Editing focus-tracker.ts');
      expect(prompt).toContain('25 minutes');
    });

    it('prompt reflects actual elapsed duration when session ended early', async () => {
      const anthropic = makeMockAnthropic(sessionResponse);
      const client = new AnthropicLlmClient(anthropic);
      await client.summarizeSession('Build focus tracker', activities, 1);

      const prompt = anthropic.messages.create.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('1 minutes');
      expect(prompt).not.toContain('25 minutes');
    });
  });

  describe('batchSummarize error classification', () => {
    it('throws LlmAuthError on 401', async () => {
      const error = new Error('401 Unauthorized') as any;
      error.status = 401;
      const anthropic = {
        messages: { create: vi.fn().mockRejectedValue(error) },
      } as any;
      const client = new AnthropicLlmClient(anthropic);

      await expect(client.batchSummarize(sampleTimeline(), 'test')).rejects.toThrow(LlmAuthError);
    });

    it('throws LlmAuthError on 403', async () => {
      const error = new Error('403 Forbidden') as any;
      error.status = 403;
      const anthropic = {
        messages: { create: vi.fn().mockRejectedValue(error) },
      } as any;
      const client = new AnthropicLlmClient(anthropic);

      await expect(client.batchSummarize(sampleTimeline(), 'test')).rejects.toThrow(LlmAuthError);
    });

    it('throws LlmModelNotFoundError on 404', async () => {
      const error = new Error('404 Not Found') as any;
      error.status = 404;
      const anthropic = {
        messages: { create: vi.fn().mockRejectedValue(error) },
      } as any;
      const client = new AnthropicLlmClient(anthropic);

      await expect(client.batchSummarize(sampleTimeline(), 'test')).rejects.toThrow(LlmModelNotFoundError);
    });

    it('returns null on other errors (network, 500, etc.)', async () => {
      const anthropic = {
        messages: { create: vi.fn().mockRejectedValue(new Error('network timeout')) },
      } as any;
      const client = new AnthropicLlmClient(anthropic);

      const result = await client.batchSummarize(sampleTimeline(), 'test');
      expect(result).toBeNull();
    });
  });
});
