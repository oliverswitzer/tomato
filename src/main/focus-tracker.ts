import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { Activity, PollState, DebugPipelineState, BatchHistoryEntry } from '../shared/ipc';
import type { ScreenpipeDb } from './screenpipe-db';
import type { LlmClient, BatchSummaryResult } from './llm-summarizer';
import { LlmAuthError, LlmModelNotFoundError } from './llm-summarizer';
import { DEFAULT_MODEL, getModelPricing } from '../config/model-pricing';
import { TimelineBuilder, type TimelineEntry, type ActivityTimeline } from './timeline-builder';
import type { ShadowEvaluator } from './shadow-eval';

const DEFAULT_TICK_MS = 15_000;
const DEFAULT_BATCH_MS = 60_000;

function log(msg: string): void {
  try {
    const logPath = path.join(app.getPath('userData'), 'tomato.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [focus-tracker] ${msg}\n`);
  } catch {}
}

export function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ');
}

export type LastActivity = { app: string; window: string } | null;

/**
 * Pure "remember last non-drift window" decision: called on every tick with
 * the previously remembered snapshot, whether the session is currently
 * flagged as drifting (per the most recent batch result), and the freshly
 * polled state. While drifting, the previous snapshot is frozen (so it keeps
 * pointing at the app/window the user was in right before drift started).
 * Once not drifting, it tracks the latest successful poll.
 */
export function computeLastNonDriftActivity(
  previous: LastActivity,
  isCurrentlyDrifting: boolean,
  pollState: PollState,
): LastActivity {
  if (isCurrentlyDrifting) return previous;
  if (pollState.screenpipeStatus !== 'ok') return previous;
  return { app: pollState.activeApp, window: pollState.windowTitle };
}

export interface FocusTrackerDeps {
  db: ScreenpipeDb;
  llm: LlmClient;
  tickIntervalMs?: number;
  batchIntervalMs?: number;
  clock?: () => Date;
  shadowEvaluator?: ShadowEvaluator;
}

export class FocusTracker {
  private timelineBuilder = new TimelineBuilder();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private activities: Activity[] = [];
  private intention = '';
  private durationMin = 25;
  private lastBatchResult: BatchSummaryResult | null = null;
  private batchHistory: BatchHistoryEntry[] = [];
  private sessionCostUsd = 0;
  private pendingLlmCall = false;
  private _paused = false;
  private lastNonDriftActivity: LastActivity = null;
  private isCurrentlyDrifting = false;

  private tickMs: number;
  private batchMs: number;
  private clock: () => Date;

  onActivity: ((activity: Activity) => void) | null = null;
  onDrift: ((data: { reason: string; confidence: number; level2Classification: string; lastActivity: LastActivity }) => void) | null = null;
  onPollState: ((state: PollState) => void) | null = null;
  onTimelineUpdate: ((entries: TimelineEntry[]) => void) | null = null;
  onApiError: ((data: { type: 'auth' | 'model_deprecated'; message: string }) => void) | null = null;

  constructor(private deps: FocusTrackerDeps) {
    this.tickMs = deps.tickIntervalMs ?? DEFAULT_TICK_MS;
    this.batchMs = deps.batchIntervalMs ?? DEFAULT_BATCH_MS;
    this.clock = deps.clock ?? (() => new Date());
  }

  start(intention: string, durationMin = 25): void {
    this.intention = intention;
    this.durationMin = durationMin;
    this.activities = [];
    this.lastBatchResult = null;
    this.lastNonDriftActivity = null;
    this.isCurrentlyDrifting = false;

    this.tick();
    this.tickTimer = setInterval(() => this.tick(), this.tickMs);
    this.batchTimer = setInterval(() => this.runBatch(), this.batchMs);

    this.deps.shadowEvaluator?.start(intention, durationMin);
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    this._paused = false;
    this.deps.shadowEvaluator?.stop();
  }

  pause(): void {
    this._paused = true;
    log('paused — batch summarization suspended');
  }

  resume(): void {
    this._paused = false;
    log('resumed — batch summarization active');
  }

  get paused(): boolean {
    return this._paused;
  }

  getActivities(): Activity[] {
    return [...this.activities];
  }

  async summarizeSession(durationMin: number): Promise<{ summary: string; focusScore: number } | null> {
    return this.deps.llm.summarizeSession(this.intention, this.activities, durationMin);
  }

  getDebugState(): DebugPipelineState {
    return {
      currentPollState: this.getLatestPollState(),
      lastTickTime: this.clock().toISOString(),
      pendingLlmCall: this.pendingLlmCall,
      lastLlmPromptPreview: this.deps.llm.getLastPrompt(),
      lastBatchResult: this.lastBatchResult
        ? {
            summary: this.lastBatchResult.summary,
            level2Classification: this.lastBatchResult.level2Classification,
            isDrifting: this.lastBatchResult.driftAssessment.isDrifting,
          }
        : null,
      batchHistory: this.batchHistory,
      sessionCostUsd: this.sessionCostUsd,
    };
  }

  tick(): void {
    const now = this.clock();
    const since = new Date(now.getTime() - this.tickMs).toISOString();
    const until = now.toISOString();

    try {
      const timeline = this.timelineBuilder.buildFromDb(this.deps.db, since, until);
      log(`tick: ${timeline.entries.length} entries, dominant=${timeline.dominantApp}, range=${since} to ${until}`);

      const pollState: PollState = {
        timestamp: until,
        activeApp: timeline.dominantApp,
        windowTitle: timeline.entries.length > 0
          ? timeline.entries[timeline.entries.length - 1].window
          : '',
        screenpipeStatus: 'ok',
      };
      this.onPollState?.(pollState);
      this.onTimelineUpdate?.(timeline.entries);
      this.lastNonDriftActivity = computeLastNonDriftActivity(
        this.lastNonDriftActivity,
        this.isCurrentlyDrifting,
        pollState,
      );
    } catch (err) {
      log(`tick error: ${(err as Error).message}`);
      this.onPollState?.({
        timestamp: until,
        activeApp: '',
        windowTitle: '',
        screenpipeStatus: 'error',
      });
    }
  }

  async runBatch(): Promise<void> {
    if (this._paused) {
      log('batch: skipped (session paused)');
      return;
    }

    const now = this.clock();
    const since = new Date(now.getTime() - this.batchMs).toISOString();
    const until = now.toISOString();

    let timeline: ActivityTimeline;
    try {
      timeline = this.timelineBuilder.buildFromDb(this.deps.db, since, until);
      log(`batch: ${timeline.entries.length} entries over ${since} to ${until}`);
    } catch (err) {
      log(`batch DB error: ${(err as Error).message}`);
      return;
    }

    if (timeline.entries.length === 0) {
      log('batch: no entries, skipping LLM call');
      return;
    }

    this.pendingLlmCall = true;
    log(`batch: calling LLM with ${timeline.entries.length} entries, intention="${this.intention}"`);

    let result;
    const batchStartMs = Date.now();
    try {
      const recentActivities = this.activities.slice(-10).map((a) => ({
        summary: a.summary,
        timestamp: a.timestamp,
        isDrifting: a.isDrifting,
        confidence: a.confidence,
      }));
      result = await this.deps.llm.batchSummarize(
        timeline,
        this.intention,
        { durationMin: this.durationMin, batchWindowSec: Math.round(this.batchMs / 1000) },
        recentActivities,
      );
    } catch (err) {
      this.pendingLlmCall = false;
      if (err instanceof LlmAuthError) {
        log('batch: auth error — pausing batch timer');
        if (this.batchTimer) {
          clearInterval(this.batchTimer);
          this.batchTimer = null;
        }
        this.onApiError?.({ type: 'auth', message: 'Your API key was rejected. Open Settings to fix it.' });
        return;
      }
      if (err instanceof LlmModelNotFoundError) {
        log(`batch: model 404 for ${err.model} — falling back to ${DEFAULT_MODEL}`);
        this.deps.llm.setModel?.(DEFAULT_MODEL);
        this.onApiError?.({ type: 'model_deprecated', message: `Switched to ${DEFAULT_MODEL} — your selected model is no longer available.` });
        return;
      }
      log(`batch: unexpected error: ${(err as Error).message}`);
      return;
    }
    this.pendingLlmCall = false;

    if (!result) {
      log('batch: LLM returned null');
      return;
    }

    log(`batch: summary="${result.summary}", classification=${result.level2Classification}, drifting=${result.driftAssessment.isDrifting}`);

    this.lastBatchResult = result;

    const batchLatencyMs = Date.now() - batchStartMs;
    this.deps.shadowEvaluator?.logProductionBatch(result, this.batchMs, since, until, timeline.entries.length, batchLatencyMs);

    const pricing = getModelPricing(this.deps.llm.getModel());
    const costUsd = pricing
      ? (result.usage.inputTokens * pricing.inputPer1M + result.usage.outputTokens * pricing.outputPer1M) / 1_000_000
      : 0;
    this.sessionCostUsd += costUsd;

    this.batchHistory.push({
      timestamp: until,
      prompt: this.deps.llm.getLastPrompt() ?? '',
      summary: result.summary,
      level2Classification: result.level2Classification,
      isDrifting: result.driftAssessment.isDrifting,
      confidence: result.driftAssessment.confidence,
      reason: result.driftAssessment.reason,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd,
    });
    if (this.batchHistory.length > 50) this.batchHistory.shift();

    const activity: Activity = {
      summary: truncateToWords(result.summary, 25),
      timestamp: until,
      apps: timeline.uniqueApps,
      isDrifting: result.driftAssessment.isDrifting,
      confidence: result.driftAssessment.confidence,
    };
    this.activities.push(activity);
    if (this.activities.length > 100) this.activities.shift();
    this.onActivity?.(activity);

    if (result.driftAssessment.isDrifting && result.driftAssessment.confidence >= 0.6) {
      this.isCurrentlyDrifting = true;
      this.onDrift?.({
        reason: result.driftAssessment.reason,
        confidence: result.driftAssessment.confidence,
        level2Classification: result.level2Classification,
        lastActivity: this.lastNonDriftActivity,
      });
    } else {
      this.isCurrentlyDrifting = false;
    }
  }

  private getLatestPollState(): PollState | null {
    try {
      const frame = this.deps.db.getLatestFrame();
      if (!frame) return null;
      return {
        timestamp: frame.timestamp,
        activeApp: frame.app_name,
        windowTitle: frame.window_name,
        screenpipeStatus: 'ok',
      };
    } catch {
      return null;
    }
  }
}
