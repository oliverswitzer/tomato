import { describe, it, expect } from 'vitest';
import { buildBatchPrompt, buildSessionPrompt, parseBatchResponse, parseSessionResponse } from '../llm-prompts';
import type { ActivityTimeline } from '../timeline-builder';

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

describe('buildBatchPrompt', () => {
  it('includes intention and timeline entries', () => {
    const prompt = buildBatchPrompt({ timeline: sampleTimeline(), intention: 'Build focus tracker' });
    expect(prompt).toContain('Build focus tracker');
    expect(prompt).toContain('Cursor');
    expect(prompt).toContain('const x = 42;');
    expect(prompt).toContain('main.ts');
  });

  it('includes drift guidance', () => {
    const prompt = buildBatchPrompt({ timeline: sampleTimeline(), intention: 'test' });
    expect(prompt).toContain('App-switching speed is NOT a drift signal');
    expect(prompt).toContain('Judge by app and content relevance');
    expect(prompt).toContain('Flag drift only when apps are clearly unrelated');
  });

  it('includes anti-hallucination rule', () => {
    const prompt = buildBatchPrompt({ timeline: sampleTimeline(), intention: 'test' });
    expect(prompt).toContain('Do not infer or fabricate video titles');
  });

  it('handles empty timeline', () => {
    const prompt = buildBatchPrompt({
      timeline: sampleTimeline({ entries: [], uniqueApps: [], dominantApp: '' }),
      intention: 'test',
    });
    expect(prompt).toContain('No activity detected');
  });

  it('includes session context window note', () => {
    const prompt = buildBatchPrompt({
      timeline: sampleTimeline(),
      intention: 'test',
      sessionContext: { durationMin: 25, batchWindowSec: 60 },
    });
    expect(prompt).toContain('60-second snapshot');
    expect(prompt).toContain('25-minute pomodoro');
  });

  it('includes passive context when present', () => {
    const prompt = buildBatchPrompt({
      timeline: sampleTimeline({
        entries: [{
          timestamp: '2026-04-25T10:00:05Z',
          app: 'Chrome',
          window: 'YouTube',
          typedText: null,
          eventType: 'passive',
          accessibilityHints: [],
          browserUrl: null,
          passiveContext: {
            urls: ['https://youtube.com/watch?v=abc'],
            screenText: 'Some screen text',
            clickTargets: ['Play'],
          },
        }],
      }),
      intention: 'test',
    });
    expect(prompt).toContain('Passive Context');
    expect(prompt).toContain('https://youtube.com/watch?v=abc');
  });
});

describe('buildSessionPrompt', () => {
  it('includes intention, activities, and duration', () => {
    const activities = [
      { summary: 'Editing code', timestamp: '2026-04-25T10:00:00Z', apps: ['Cursor'] },
    ];
    const prompt = buildSessionPrompt('Build tracker', activities, 25);
    expect(prompt).toContain('Build tracker');
    expect(prompt).toContain('Editing code');
    expect(prompt).toContain('25 minutes');
  });

  it('handles empty activities', () => {
    const prompt = buildSessionPrompt('test', [], 25);
    expect(prompt).toContain('No activity was recorded');
  });
});

describe('parseBatchResponse', () => {
  it('parses valid JSON response', () => {
    const result = parseBatchResponse(JSON.stringify({
      summary: 'Edited code in Cursor.',
      level2Classification: 'Building',
      driftAssessment: { isDrifting: false, confidence: 0.9, reason: 'On task.' },
    }));
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('Edited code in Cursor.');
    expect(result!.level2Classification).toBe('Building');
    expect(result!.driftAssessment.isDrifting).toBe(false);
    expect(result!.driftAssessment.confidence).toBe(0.9);
  });

  it('extracts JSON from surrounding text', () => {
    const result = parseBatchResponse(`Here is the analysis:\n${JSON.stringify({
      summary: 'test',
      level2Classification: 'Building',
      driftAssessment: { isDrifting: false, confidence: 0.5, reason: 'ok' },
    })}\nDone.`);
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('test');
  });

  it('returns null for non-JSON text', () => {
    expect(parseBatchResponse('This is not JSON')).toBeNull();
  });

  it('returns null for JSON missing required fields', () => {
    expect(parseBatchResponse(JSON.stringify({ summary: 'hello' }))).toBeNull();
  });

  it('coerces drift assessment fields', () => {
    const result = parseBatchResponse(JSON.stringify({
      summary: 'test',
      level2Classification: 'Building',
      driftAssessment: { isDrifting: 1, confidence: '0.7', reason: null },
    }));
    expect(result).not.toBeNull();
    expect(result!.driftAssessment.isDrifting).toBe(true);
    expect(result!.driftAssessment.confidence).toBe(0.7);
    expect(result!.driftAssessment.reason).toBe('');
  });
});

describe('parseSessionResponse', () => {
  it('parses valid session response', () => {
    const result = parseSessionResponse(JSON.stringify({
      summary: 'Great session.',
      focusScore: 85,
    }));
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('Great session.');
    expect(result!.focusScore).toBe(85);
  });

  it('clamps focus score to 0-100', () => {
    expect(parseSessionResponse(JSON.stringify({ summary: 'test', focusScore: 150 }))!.focusScore).toBe(100);
    expect(parseSessionResponse(JSON.stringify({ summary: 'test', focusScore: -10 }))!.focusScore).toBe(0);
  });

  it('returns null for missing fields', () => {
    expect(parseSessionResponse(JSON.stringify({ summary: 'test' }))).toBeNull();
  });

  it('returns null for non-JSON', () => {
    expect(parseSessionResponse('not json')).toBeNull();
  });
});
