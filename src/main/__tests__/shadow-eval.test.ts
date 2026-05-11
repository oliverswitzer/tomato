import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ScreenpipeDb } from '../screenpipe-db';
import type { LlmClient, BatchSummaryResult } from '../llm-summarizer';
import type { ShadowEvalEntry } from '../shadow-eval';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
}));

const { ShadowEvaluator } = await import('../shadow-eval');

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

const defaultResult: BatchSummaryResult = {
  summary: 'Editing code in Cursor.',
  level2Classification: 'Building',
  driftAssessment: { isDrifting: false, confidence: 0.9, reason: 'On task.' },
  usage: { inputTokens: 400, outputTokens: 90 },
};

function mockLlm(result?: BatchSummaryResult): LlmClient {
  return {
    batchSummarize: vi.fn().mockResolvedValue({ result: result ?? defaultResult, prompt: 'mock prompt' }),
    summarizeSession: vi.fn().mockResolvedValue({ summary: 'Session.', focusScore: 85 }),
    getLastPrompt: vi.fn().mockReturnValue('mock prompt'),
    getModel: vi.fn().mockReturnValue('claude-haiku-4-5-20251001'),
  };
}

describe('ShadowEvaluator', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-eval-test-'));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a log file path on construction', () => {
    const evaluator = new ShadowEvaluator(mockDb(), mockLlm(), () => new Date(), tmpDir);
    expect(evaluator.getLogFilePath()).toContain('shadow-eval-');
    expect(evaluator.getLogFilePath()).toContain('.jsonl');
  });

  it('logs production batch entry via logProductionBatch', () => {
    const evaluator = new ShadowEvaluator(mockDb(), mockLlm(), () => new Date(), tmpDir);

    evaluator.logProductionBatch(
      defaultResult,
      60_000,
      '2026-04-25T10:00:00Z',
      '2026-04-25T10:01:00Z',
      5,
      1200,
    );

    const content = fs.readFileSync(evaluator.getLogFilePath(), 'utf-8').trim();
    const entry: ShadowEvalEntry = JSON.parse(content);
    expect(entry.interval).toBe(60);
    expect(entry.summary).toBe('Editing code in Cursor.');
    expect(entry.classification).toBe('Building');
    expect(entry.isDrifting).toBe(false);
    expect(entry.confidence).toBe(0.9);
    expect(entry.tokenUsage.input).toBe(400);
    expect(entry.tokenUsage.output).toBe(90);
    expect(entry.latencyMs).toBe(1200);
    expect(entry.rawActivityWindow.entryCount).toBe(5);
  });

  it('runs shadow batches on interval timers', async () => {
    const llm = mockLlm();
    const evaluator = new ShadowEvaluator(mockDb(), llm, () => new Date('2026-04-25T10:05:00Z'), tmpDir);

    evaluator.start('Build feature', 25);

    // At 30s: 15s fires twice (15s, 30s), 30s fires once = 3 calls
    await vi.advanceTimersByTimeAsync(30_000);
    expect(llm.batchSummarize).toHaveBeenCalledTimes(3);

    evaluator.stop();
  });

  it('logs entries for each shadow interval that fires', async () => {
    const llm = mockLlm();
    const evaluator = new ShadowEvaluator(mockDb(), llm, () => new Date('2026-04-25T10:05:00Z'), tmpDir);

    evaluator.start('Build feature', 25);

    // 15s fires at 15s, 30s, 45s, 60s, 75s, 90s (6 times)
    // 30s fires at 30s, 60s, 90s (3 times)
    // 90s fires at 90s (1 time)
    // 180s has not fired yet
    await vi.advanceTimersByTimeAsync(90_000);

    const lines = fs.readFileSync(evaluator.getLogFilePath(), 'utf-8').trim().split('\n');
    expect(lines.length).toBe(10);

    const entries: ShadowEvalEntry[] = lines.map((l) => JSON.parse(l));
    const intervals = entries.map((e) => e.interval);
    expect(intervals.filter((i) => i === 15)).toHaveLength(6);
    expect(intervals.filter((i) => i === 30)).toHaveLength(3);
    expect(intervals.filter((i) => i === 90)).toHaveLength(1);

    evaluator.stop();
  });

  it('stop clears all shadow timers', async () => {
    const llm = mockLlm();
    const evaluator = new ShadowEvaluator(mockDb(), llm, () => new Date('2026-04-25T10:05:00Z'), tmpDir);

    evaluator.start('Build feature', 25);
    evaluator.stop();

    await vi.advanceTimersByTimeAsync(180_000);
    expect(llm.batchSummarize).not.toHaveBeenCalled();
  });

  it('passes correct batchWindowSec to LLM for each interval', async () => {
    const llm = mockLlm();
    const evaluator = new ShadowEvaluator(mockDb(), llm, () => new Date('2026-04-25T10:05:00Z'), tmpDir);

    evaluator.start('Build feature', 25);

    // At 15s: only the 15s interval fires first
    await vi.advanceTimersByTimeAsync(15_000);

    const call = (llm.batchSummarize as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toEqual({ durationMin: 25, batchWindowSec: 15 });

    evaluator.stop();
  });

  it('maintains separate rolling activity history per interval', async () => {
    const llm = mockLlm();
    const evaluator = new ShadowEvaluator(mockDb(), llm, () => new Date('2026-04-25T10:05:00Z'), tmpDir);

    evaluator.start('Build feature', 25);

    // At 15s: 15s interval fires once (1st call, 0 previous)
    await vi.advanceTimersByTimeAsync(15_000);
    const calls15 = (llm.batchSummarize as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls15[0][2]).toEqual({ durationMin: 25, batchWindowSec: 15 });
    expect(calls15[0][3]).toHaveLength(0);

    // At 30s: 15s fires again (1 previous), 30s fires (0 previous)
    await vi.advanceTimersByTimeAsync(15_000);
    const callsAt30 = (llm.batchSummarize as ReturnType<typeof vi.fn>).mock.calls;
    const fifteenSecond = callsAt30.filter((c: unknown[]) => (c[2] as { batchWindowSec: number }).batchWindowSec === 15);
    expect(fifteenSecond[1][3]).toHaveLength(1);
    const thirtySecFirst = callsAt30.filter((c: unknown[]) => (c[2] as { batchWindowSec: number }).batchWindowSec === 30);
    expect(thirtySecFirst[0][3]).toHaveLength(0);

    evaluator.stop();
  });

  it('skips shadow batch when timeline is empty', async () => {
    const db = mockDb();
    (db.getTextEvents as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (db.getFrames as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const llm = mockLlm();
    const evaluator = new ShadowEvaluator(db, llm, () => new Date('2026-04-25T10:05:00Z'), tmpDir);

    evaluator.start('Build feature', 25);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(llm.batchSummarize).not.toHaveBeenCalled();

    evaluator.stop();
  });

  it('handles LLM errors gracefully without crashing', async () => {
    const llm = mockLlm();
    (llm.batchSummarize as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API timeout'));
    const evaluator = new ShadowEvaluator(mockDb(), llm, () => new Date('2026-04-25T10:05:00Z'), tmpDir);

    evaluator.start('Build feature', 25);
    await vi.advanceTimersByTimeAsync(30_000);

    // Should not throw, and log file should be empty (no entry written)
    expect(fs.existsSync(evaluator.getLogFilePath())).toBe(false);

    evaluator.stop();
  });

  it('handles LLM returning null gracefully', async () => {
    const llm = mockLlm();
    (llm.batchSummarize as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const evaluator = new ShadowEvaluator(mockDb(), llm, () => new Date('2026-04-25T10:05:00Z'), tmpDir);

    evaluator.start('Build feature', 25);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(fs.existsSync(evaluator.getLogFilePath())).toBe(false);

    evaluator.stop();
  });

  it('getEntries returns in-memory entries across all intervals', async () => {
    const llm = mockLlm();
    const evaluator = new ShadowEvaluator(mockDb(), llm, () => new Date('2026-04-25T10:05:00Z'), tmpDir);

    expect(evaluator.getEntries()).toHaveLength(0);

    evaluator.start('Build feature', 25);
    await vi.advanceTimersByTimeAsync(30_000);

    // 15s fires twice, 30s fires once = 3 entries in memory
    const entries = evaluator.getEntries();
    expect(entries).toHaveLength(3);
    expect(entries.filter((e) => e.interval === 15)).toHaveLength(2);
    expect(entries.filter((e) => e.interval === 30)).toHaveLength(1);

    evaluator.stop();
  });

  it('getEntries includes production batch entries', () => {
    const evaluator = new ShadowEvaluator(mockDb(), mockLlm(), () => new Date(), tmpDir);

    evaluator.logProductionBatch(
      defaultResult, 60_000,
      '2026-04-25T10:00:00Z', '2026-04-25T10:01:00Z',
      5, 1200,
    );

    const entries = evaluator.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].interval).toBe(60);
  });

  it('computes cost based on model pricing', () => {
    const llm = mockLlm();
    const evaluator = new ShadowEvaluator(mockDb(), llm, () => new Date(), tmpDir);

    evaluator.logProductionBatch(
      defaultResult,
      60_000,
      '2026-04-25T10:00:00Z',
      '2026-04-25T10:01:00Z',
      5,
      1200,
    );

    const content = fs.readFileSync(evaluator.getLogFilePath(), 'utf-8').trim();
    const entry: ShadowEvalEntry = JSON.parse(content);
    // claude-haiku-4-5-20251001: $1.00/1M input, $5.00/1M output
    // 400 input tokens * $1.00/1M + 90 output tokens * $5.00/1M
    const expectedCost = (400 * 1.0 + 90 * 5.0) / 1_000_000;
    expect(entry.costUsd).toBeCloseTo(expectedCost, 8);
  });
});
