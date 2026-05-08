import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FocusTracker, truncateToWords } from '../focus-tracker';
import { LlmAuthError, LlmModelNotFoundError } from '../llm-summarizer';
import type { ScreenpipeDb } from '../screenpipe-db';
import type { LlmClient, BatchSummaryResult } from '../llm-summarizer';
import type { Activity, PollState } from '../../shared/ipc';
import type { TimelineEntry } from '../timeline-builder';
import type { ShadowEvaluator } from '../shadow-eval';

function mockDb(): ScreenpipeDb {
  return {
    getTextEvents: vi.fn().mockReturnValue([
      { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'hello world', app_name: 'Cursor', window_title: 'main.ts' },
    ]),
    getAppSwitches: vi.fn().mockReturnValue([]),
    getClipboardEvents: vi.fn().mockReturnValue([]),
    getLatestFrame: vi.fn().mockReturnValue({
      id: 1, timestamp: '2026-04-25T10:00:05Z', app_name: 'Cursor', window_name: 'main.ts', focused: true, browser_url: null,
    }),
    getFrames: vi.fn().mockReturnValue([
      { id: 1, timestamp: '2026-04-25T10:00:05Z', app_name: 'Cursor', window_name: 'main.ts', focused: true, browser_url: null },
    ]),
    getPassiveFrames: vi.fn().mockReturnValue([]),
    getClickEvents: vi.fn().mockReturnValue([]),
    getAccessibilityElements: vi.fn().mockReturnValue([]),
    isHealthy: vi.fn().mockReturnValue(true),
    close: vi.fn(),
  };
}

function mockLlm(result?: BatchSummaryResult): LlmClient {
  return {
    batchSummarize: vi.fn().mockResolvedValue(result ?? {
      summary: 'Editing code in Cursor.',
      level2Classification: 'Building',
      driftAssessment: { isDrifting: false, confidence: 0.9, reason: 'On task.' },
      usage: { inputTokens: 400, outputTokens: 90 },
    }),
    summarizeSession: vi.fn().mockResolvedValue({
      summary: 'Worked on focus tracker.',
      focusScore: 85,
    }),
    getLastPrompt: vi.fn().mockReturnValue('mock prompt'),
    getModel: vi.fn().mockReturnValue('claude-haiku-4-5-20251001'),
  };
}

describe('FocusTracker', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('15s tick sends TimelineEntry[] to dashboard without calling LLM', () => {
    const db = mockDb();
    const llm = mockLlm();
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 60000 });

    const timelineUpdates: TimelineEntry[][] = [];
    tracker.onTimelineUpdate = (entries) => timelineUpdates.push(entries);

    tracker.start('Build focus tracker');

    expect(timelineUpdates).toHaveLength(1);
    expect(timelineUpdates[0].length).toBeGreaterThan(0);
    expect(timelineUpdates[0][0].app).toBe('Cursor');
    expect(llm.batchSummarize).not.toHaveBeenCalled();

    tracker.stop();
  });

  it('15s tick emits PollState', () => {
    const db = mockDb();
    const llm = mockLlm();
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 60000 });

    const pollStates: PollState[] = [];
    tracker.onPollState = (state) => pollStates.push(state);

    tracker.start('test');

    expect(pollStates).toHaveLength(1);
    expect(pollStates[0].activeApp).toBe('Cursor');
    expect(pollStates[0].screenpipeStatus).toBe('ok');

    tracker.stop();
  });

  it('3-min batch triggers LLM call and emits Activity', async () => {
    const db = mockDb();
    const llm = mockLlm();
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

    const activities: Activity[] = [];
    tracker.onActivity = (a) => activities.push(a);

    tracker.start('Build focus tracker');

    await vi.advanceTimersByTimeAsync(10000);

    expect(llm.batchSummarize).toHaveBeenCalledOnce();
    expect(activities).toHaveLength(1);
    expect(activities[0].summary).toBe('Editing code in Cursor.');

    tracker.stop();
  });

  it('drift detection triggers onDrift when confidence >= 0.6', async () => {
    const db = mockDb();
    const llm = mockLlm({
      summary: 'Browsing social media.',
      level2Classification: 'Off-task',
      driftAssessment: { isDrifting: true, confidence: 0.8, reason: 'User switched to LinkedIn feed.' },
      usage: { inputTokens: 400, outputTokens: 90 },
    });
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

    const driftEvents: { reason: string; confidence: number; level2Classification: string }[] = [];
    tracker.onDrift = (data) => driftEvents.push(data);

    tracker.start('Build focus tracker');
    await vi.advanceTimersByTimeAsync(10000);

    expect(driftEvents).toHaveLength(1);
    expect(driftEvents[0].reason).toContain('LinkedIn');
    expect(driftEvents[0].confidence).toBe(0.8);
    expect(driftEvents[0].level2Classification).toBe('Off-task');

    tracker.stop();
  });

  it('low-confidence drift does NOT trigger onDrift', async () => {
    const db = mockDb();
    const llm = mockLlm({
      summary: 'Checking something.',
      level2Classification: 'Research',
      driftAssessment: { isDrifting: true, confidence: 0.3, reason: 'Maybe off task.' },
      usage: { inputTokens: 400, outputTokens: 90 },
    });
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

    const driftEvents: { reason: string }[] = [];
    tracker.onDrift = (data) => driftEvents.push(data);

    tracker.start('test');
    await vi.advanceTimersByTimeAsync(10000);

    expect(driftEvents).toHaveLength(0);

    tracker.stop();
  });

  it('stop clears both timers', async () => {
    const db = mockDb();
    const llm = mockLlm();
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

    const pollStates: PollState[] = [];
    tracker.onPollState = (state) => pollStates.push(state);

    tracker.start('test');
    expect(pollStates).toHaveLength(1);

    tracker.stop();

    await vi.advanceTimersByTimeAsync(20000);
    expect(pollStates).toHaveLength(1);
    expect(llm.batchSummarize).not.toHaveBeenCalled();
  });

  it('activities capped at 100', async () => {
    const db = mockDb();
    const llm = mockLlm();
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 1000 });

    tracker.start('test');

    for (let i = 0; i < 105; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    expect(tracker.getActivities().length).toBeLessThanOrEqual(100);

    tracker.stop();
  });

  it('DB error in tick reports error status', () => {
    const db = mockDb();
    (db.getTextEvents as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('DB locked'); });
    const llm = mockLlm();
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 60000 });

    const pollStates: PollState[] = [];
    tracker.onPollState = (state) => pollStates.push(state);

    tracker.start('test');

    expect(pollStates).toHaveLength(1);
    expect(pollStates[0].screenpipeStatus).toBe('error');

    tracker.stop();
  });

  it('summarizeSession passes the given durationMin to LLM', async () => {
    const db = mockDb();
    const llm = mockLlm();
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

    tracker.start('Build focus tracker', 25);
    await vi.advanceTimersByTimeAsync(10000);

    await tracker.summarizeSession(1);

    expect(llm.summarizeSession).toHaveBeenCalledWith(
      'Build focus tracker',
      expect.any(Array),
      1,
    );

    tracker.stop();
  });

  it('getDebugState returns current pipeline state', () => {
    const db = mockDb();
    const llm = mockLlm();
    const tracker = new FocusTracker({ db, llm });

    const state = tracker.getDebugState();

    expect(state).toHaveProperty('currentPollState');
    expect(state).toHaveProperty('pendingLlmCall');
    expect(state).toHaveProperty('lastLlmPromptPreview');
    expect(state.pendingLlmCall).toBe(false);
  });

  it('batch skips LLM call and drift when paused', async () => {
    const db = mockDb();
    const llm = mockLlm({
      summary: 'Browsing social media.',
      level2Classification: 'Off-task',
      driftAssessment: { isDrifting: true, confidence: 0.8, reason: 'User is off task.' },
      usage: { inputTokens: 400, outputTokens: 90 },
    });
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

    const driftEvents: { reason: string }[] = [];
    tracker.onDrift = (data) => driftEvents.push(data);

    tracker.start('Build focus tracker');
    tracker.pause();

    await vi.advanceTimersByTimeAsync(10000);

    expect(llm.batchSummarize).not.toHaveBeenCalled();
    expect(driftEvents).toHaveLength(0);

    tracker.stop();
  });

  it('batch resumes after pause/resume cycle', async () => {
    const db = mockDb();
    const llm = mockLlm();
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

    tracker.start('Build focus tracker');
    tracker.pause();

    await vi.advanceTimersByTimeAsync(10000);
    expect(llm.batchSummarize).not.toHaveBeenCalled();

    tracker.resume();

    await vi.advanceTimersByTimeAsync(10000);
    expect(llm.batchSummarize).toHaveBeenCalledOnce();

    tracker.stop();
  });

  it('paused getter reflects current state', () => {
    const db = mockDb();
    const llm = mockLlm();
    const tracker = new FocusTracker({ db, llm });

    expect(tracker.paused).toBe(false);
    tracker.pause();
    expect(tracker.paused).toBe(true);
    tracker.resume();
    expect(tracker.paused).toBe(false);
  });

  it('stop resets paused state', () => {
    const db = mockDb();
    const llm = mockLlm();
    const tracker = new FocusTracker({ db, llm });

    tracker.start('test');
    tracker.pause();
    expect(tracker.paused).toBe(true);
    tracker.stop();
    expect(tracker.paused).toBe(false);
  });

  it('batch skips LLM call when timeline is empty', async () => {
    const db = mockDb();
    (db.getTextEvents as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (db.getFrames as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const llm = mockLlm();
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

    tracker.start('test');
    await vi.advanceTimersByTimeAsync(10000);

    expect(llm.batchSummarize).not.toHaveBeenCalled();

    tracker.stop();
  });

  it('401 from LLM pauses batch timer and emits onApiError', async () => {
    const db = mockDb();
    const llm = mockLlm();
    (llm.batchSummarize as ReturnType<typeof vi.fn>).mockRejectedValue(new LlmAuthError());
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

    const apiErrors: { type: string; message: string }[] = [];
    tracker.onApiError = (data) => apiErrors.push(data);

    const pollStates: PollState[] = [];
    tracker.onPollState = (state) => pollStates.push(state);

    tracker.start('test');
    await vi.advanceTimersByTimeAsync(10000);

    expect(apiErrors).toHaveLength(1);
    expect(apiErrors[0].type).toBe('auth');

    const callCount = (llm.batchSummarize as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect((llm.batchSummarize as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);

    const pollCountBefore = pollStates.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(pollStates.length).toBeGreaterThan(pollCountBefore);

    tracker.stop();
  });

  it('404 from LLM triggers model fallback and emits onApiError', async () => {
    const db = mockDb();
    const llm = mockLlm();
    (llm.batchSummarize as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new LlmModelNotFoundError('old-model'))
      .mockResolvedValue({
        summary: 'Back to normal.',
        level2Classification: 'Building',
        driftAssessment: { isDrifting: false, confidence: 0.9, reason: 'On task.' },
        usage: { inputTokens: 400, outputTokens: 90 },
      });
    const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

    const apiErrors: { type: string; message: string }[] = [];
    tracker.onApiError = (data) => apiErrors.push(data);

    tracker.start('test');
    await vi.advanceTimersByTimeAsync(10000);

    expect(apiErrors).toHaveLength(1);
    expect(apiErrors[0].type).toBe('model_deprecated');

    const activities: Activity[] = [];
    tracker.onActivity = (a) => activities.push(a);
    await vi.advanceTimersByTimeAsync(10000);
    expect(activities).toHaveLength(1);

    tracker.stop();
  });

  describe('rolling context', () => {
    it('activity summaries are truncated to 25 words', async () => {
      const db = mockDb();
      const longSummary = Array(30).fill('word').join(' ');
      const llm = mockLlm({
        summary: longSummary,
        level2Classification: 'Building',
        driftAssessment: { isDrifting: false, confidence: 0.9, reason: 'On task.' },
        usage: { inputTokens: 400, outputTokens: 90 },
      });
      const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

      tracker.start('test');
      await vi.advanceTimersByTimeAsync(10000);

      const activities = tracker.getActivities();
      expect(activities).toHaveLength(1);
      expect(activities[0].summary.split(/\s+/).length).toBeLessThanOrEqual(25);

      tracker.stop();
    });

    it('activities store isDrifting and confidence from drift assessment', async () => {
      const db = mockDb();
      const llm = mockLlm({
        summary: 'Browsing social media.',
        level2Classification: 'Off-task',
        driftAssessment: { isDrifting: true, confidence: 0.8, reason: 'User is off task.' },
        usage: { inputTokens: 400, outputTokens: 90 },
      });
      const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

      tracker.start('Build focus tracker');
      await vi.advanceTimersByTimeAsync(10000);

      const activities = tracker.getActivities();
      expect(activities[0].isDrifting).toBe(true);
      expect(activities[0].confidence).toBe(0.8);

      tracker.stop();
    });

    it('passes last 10 activities to batchSummarize after accumulation', async () => {
      const db = mockDb();
      const llm = mockLlm();
      const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 1000 });

      tracker.start('test');

      for (let i = 0; i < 12; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const lastCall = (llm.batchSummarize as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
      const previousActivities = lastCall[3];
      expect(previousActivities).toHaveLength(10);
      expect(previousActivities[0]).toHaveProperty('summary');
      expect(previousActivities[0]).toHaveProperty('isDrifting');
      expect(previousActivities[0]).toHaveProperty('confidence');

      tracker.stop();
    });

    it('passes empty array on first batch (no previous activities)', async () => {
      const db = mockDb();
      const llm = mockLlm();
      const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

      tracker.start('test');
      await vi.advanceTimersByTimeAsync(10000);

      const firstCall = (llm.batchSummarize as ReturnType<typeof vi.fn>).mock.calls[0];
      const previousActivities = firstCall[3];
      expect(previousActivities).toHaveLength(0);

      tracker.stop();
    });

    it('passes fewer than 10 when fewer exist', async () => {
      const db = mockDb();
      const llm = mockLlm();
      const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 1000 });

      tracker.start('test');
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const thirdCall = (llm.batchSummarize as ReturnType<typeof vi.fn>).mock.calls[2];
      const previousActivities = thirdCall[3];
      expect(previousActivities).toHaveLength(2);

      tracker.stop();
    });
  });

  describe('getDriftContext', () => {
    it('returns null when no batch result exists', () => {
      const tracker = new FocusTracker({ db: mockDb(), llm: mockLlm() });
      expect(tracker.getDriftContext()).toBeNull();
    });

    it('returns null when last batch was not drifting', async () => {
      const db = mockDb();
      const llm = mockLlm({
        summary: 'On task.',
        level2Classification: 'Building',
        driftAssessment: { isDrifting: false, confidence: 0.9, reason: 'On task.' },
        usage: { inputTokens: 400, outputTokens: 90 },
      });
      const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

      tracker.start('Build feature');
      await vi.advanceTimersByTimeAsync(10000);

      expect(tracker.getDriftContext()).toBeNull();
      tracker.stop();
    });

    it('returns drift context when drifting', async () => {
      const db = mockDb();
      const llm = mockLlm({
        summary: 'Browsing social media.',
        level2Classification: 'Off-task',
        driftAssessment: { isDrifting: true, confidence: 0.8, reason: 'Switched to LinkedIn.' },
        usage: { inputTokens: 400, outputTokens: 90 },
      });
      const tracker = new FocusTracker({ db, llm, tickIntervalMs: 5000, batchIntervalMs: 10000 });

      tracker.start('Build focus tracker', 25);
      await vi.advanceTimersByTimeAsync(10000);

      const ctx = tracker.getDriftContext();
      expect(ctx).not.toBeNull();
      expect(ctx!.intention).toBe('Build focus tracker');
      expect(ctx!.batchResult.driftAssessment.isDrifting).toBe(true);
      expect(ctx!.batchResult.summary).toBe('Browsing social media.');
      expect(ctx!.timeline.entries.length).toBeGreaterThan(0);

      tracker.stop();
    });
  });

  describe('shadow evaluation integration', () => {
    function mockShadowEvaluator(): ShadowEvaluator {
      return {
        start: vi.fn(),
        stop: vi.fn(),
        logProductionBatch: vi.fn(),
        logEntry: vi.fn(),
        getLogFilePath: vi.fn().mockReturnValue('/tmp/shadow-eval.jsonl'),
      } as unknown as ShadowEvaluator;
    }

    it('starts shadow evaluator when session starts', () => {
      const shadow = mockShadowEvaluator();
      const tracker = new FocusTracker({ db: mockDb(), llm: mockLlm(), shadowEvaluator: shadow });

      tracker.start('Build feature', 25);
      expect(shadow.start).toHaveBeenCalledWith('Build feature', 25);

      tracker.stop();
    });

    it('stops shadow evaluator when session stops', () => {
      const shadow = mockShadowEvaluator();
      const tracker = new FocusTracker({ db: mockDb(), llm: mockLlm(), shadowEvaluator: shadow });

      tracker.start('Build feature', 25);
      tracker.stop();
      expect(shadow.stop).toHaveBeenCalled();
    });

    it('logs production batch result to shadow evaluator', async () => {
      const shadow = mockShadowEvaluator();
      const tracker = new FocusTracker({
        db: mockDb(),
        llm: mockLlm(),
        batchIntervalMs: 10000,
        tickIntervalMs: 5000,
        shadowEvaluator: shadow,
      });

      tracker.start('Build feature', 25);
      await vi.advanceTimersByTimeAsync(10000);

      expect(shadow.logProductionBatch).toHaveBeenCalledOnce();
      const [result, batchMs, since, until, entryCount, latencyMs] =
        (shadow.logProductionBatch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(result.summary).toBe('Editing code in Cursor.');
      expect(batchMs).toBe(10000);
      expect(typeof since).toBe('string');
      expect(typeof until).toBe('string');
      expect(entryCount).toBeGreaterThan(0);
      expect(typeof latencyMs).toBe('number');

      tracker.stop();
    });

    it('does not log to shadow evaluator when LLM returns null', async () => {
      const llm = mockLlm();
      (llm.batchSummarize as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const shadow = mockShadowEvaluator();
      const tracker = new FocusTracker({
        db: mockDb(),
        llm,
        batchIntervalMs: 10000,
        tickIntervalMs: 5000,
        shadowEvaluator: shadow,
      });

      tracker.start('Build feature', 25);
      await vi.advanceTimersByTimeAsync(10000);

      expect(shadow.logProductionBatch).not.toHaveBeenCalled();

      tracker.stop();
    });
  });

  describe('truncateToWords', () => {
    it('returns text unchanged when under limit', () => {
      expect(truncateToWords('hello world', 25)).toBe('hello world');
    });

    it('truncates text exceeding word limit', () => {
      const text = Array(30).fill('word').join(' ');
      const result = truncateToWords(text, 25);
      expect(result.split(/\s+/).length).toBe(25);
    });

    it('returns exact limit when at boundary', () => {
      const text = Array(25).fill('word').join(' ');
      expect(truncateToWords(text, 25)).toBe(text);
    });
  });
});
