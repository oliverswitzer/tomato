import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FocusTracker } from '../focus-tracker';
import type { ScreenpipeDb } from '../screenpipe-db';
import type { LlmClient, BatchSummaryResult } from '../llm-summarizer';
import type { Activity, PollState } from '../../shared/ipc';
import type { TimelineEntry } from '../timeline-builder';

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
    }),
    getLastPrompt: vi.fn().mockReturnValue('mock prompt'),
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
});
