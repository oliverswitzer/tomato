import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { Activity, PollState, DebugPipelineState } from '../shared/ipc';
import type { ScreenpipeDb } from './screenpipe-db';
import type { LlmClient, BatchSummaryResult } from './llm-summarizer';
import { TimelineBuilder, type TimelineEntry, type ActivityTimeline } from './timeline-builder';

const DEFAULT_TICK_MS = 15_000;
const DEFAULT_BATCH_MS = 180_000;

function log(msg: string): void {
  try {
    const logPath = path.join(app.getPath('userData'), 'tomato.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [focus-tracker] ${msg}\n`);
  } catch {}
}

export interface FocusTrackerDeps {
  db: ScreenpipeDb;
  llm: LlmClient;
  tickIntervalMs?: number;
  batchIntervalMs?: number;
  clock?: () => Date;
}

export class FocusTracker {
  private timelineBuilder = new TimelineBuilder();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private activities: Activity[] = [];
  private intention = '';
  private durationMin = 25;
  private lastBatchResult: BatchSummaryResult | null = null;
  private pendingLlmCall = false;

  private tickMs: number;
  private batchMs: number;
  private clock: () => Date;

  onActivity: ((activity: Activity) => void) | null = null;
  onDrift: ((data: { reason: string; confidence: number; level2Classification: string }) => void) | null = null;
  onPollState: ((state: PollState) => void) | null = null;
  onTimelineUpdate: ((entries: TimelineEntry[]) => void) | null = null;

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

    this.tick();
    this.tickTimer = setInterval(() => this.tick(), this.tickMs);
    this.batchTimer = setInterval(() => this.runBatch(), this.batchMs);
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
    const result = await this.deps.llm.batchSummarize(timeline, this.intention, {
      durationMin: this.durationMin,
      batchWindowSec: Math.round(this.batchMs / 1000),
    });
    this.pendingLlmCall = false;

    if (!result) {
      log('batch: LLM returned null');
      return;
    }

    log(`batch: summary="${result.summary}", classification=${result.level2Classification}, drifting=${result.driftAssessment.isDrifting}`);

    this.lastBatchResult = result;

    const activity: Activity = {
      summary: result.summary,
      timestamp: until,
      apps: timeline.uniqueApps,
    };
    this.activities.push(activity);
    if (this.activities.length > 100) this.activities.shift();
    this.onActivity?.(activity);

    if (result.driftAssessment.isDrifting && result.driftAssessment.confidence >= 0.6) {
      this.onDrift?.({
        reason: result.driftAssessment.reason,
        confidence: result.driftAssessment.confidence,
        level2Classification: result.level2Classification,
      });
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
