import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { ScreenpipeDb } from './screenpipe-db';
import type { LlmClient, BatchSummaryResult, RollingActivity } from './llm-summarizer';
import { TimelineBuilder } from './timeline-builder';
import { getModelPricing } from '../config/model-pricing';

export interface ShadowEvalEntry {
  interval: number;
  timestamp: string;
  summary: string;
  classification: string;
  isDrifting: boolean;
  confidence: number;
  reason: string;
  rawActivityWindow: { since: string; until: string; entryCount: number };
  tokenUsage: { input: number; output: number };
  latencyMs: number;
  costUsd: number;
}

const SHADOW_INTERVALS = [30_000, 90_000, 180_000];

function log(msg: string): void {
  try {
    const logPath = path.join(app.getPath('userData'), 'tomato.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [shadow-eval] ${msg}\n`);
  } catch {}
}

export class ShadowEvaluator {
  private timers: ReturnType<typeof setInterval>[] = [];
  private timelineBuilder = new TimelineBuilder();
  private activitiesPerInterval = new Map<number, RollingActivity[]>();
  private logFilePath: string;
  private intention = '';
  private durationMin = 25;

  constructor(
    private db: ScreenpipeDb,
    private llm: LlmClient,
    private clock: () => Date = () => new Date(),
    logDir?: string,
  ) {
    const dir = logDir ?? app.getPath('userData');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFilePath = path.join(dir, `shadow-eval-${ts}.jsonl`);

    for (const interval of SHADOW_INTERVALS) {
      this.activitiesPerInterval.set(interval, []);
    }
  }

  getLogFilePath(): string {
    return this.logFilePath;
  }

  start(intention: string, durationMin: number): void {
    this.intention = intention;
    this.durationMin = durationMin;

    for (const interval of SHADOW_INTERVALS) {
      this.activitiesPerInterval.set(interval, []);
    }

    log(`starting shadow evaluation, intervals=${SHADOW_INTERVALS.map((i) => i / 1000 + 's').join(',')}, log=${this.logFilePath}`);

    for (const intervalMs of SHADOW_INTERVALS) {
      const timer = setInterval(() => this.runShadowBatch(intervalMs), intervalMs);
      this.timers.push(timer);
    }
  }

  stop(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    log('stopped shadow evaluation');
  }

  logEntry(entry: ShadowEvalEntry): void {
    try {
      fs.appendFileSync(this.logFilePath, JSON.stringify(entry) + '\n');
    } catch (err) {
      log(`failed to write entry: ${(err as Error).message}`);
    }
  }

  logProductionBatch(result: BatchSummaryResult, batchMs: number, since: string, until: string, entryCount: number, latencyMs: number): void {
    const pricing = getModelPricing(this.llm.getModel());
    const costUsd = pricing
      ? (result.usage.inputTokens * pricing.inputPer1M + result.usage.outputTokens * pricing.outputPer1M) / 1_000_000
      : 0;

    const entry: ShadowEvalEntry = {
      interval: batchMs / 1000,
      timestamp: until,
      summary: result.summary,
      classification: result.level2Classification,
      isDrifting: result.driftAssessment.isDrifting,
      confidence: result.driftAssessment.confidence,
      reason: result.driftAssessment.reason,
      rawActivityWindow: { since, until, entryCount },
      tokenUsage: { input: result.usage.inputTokens, output: result.usage.outputTokens },
      latencyMs,
      costUsd,
    };
    this.logEntry(entry);
  }

  private async runShadowBatch(intervalMs: number): Promise<void> {
    const now = this.clock();
    const since = new Date(now.getTime() - intervalMs).toISOString();
    const until = now.toISOString();
    const intervalSec = intervalMs / 1000;

    let timeline;
    try {
      timeline = this.timelineBuilder.buildFromDb(this.db, since, until);
    } catch (err) {
      log(`shadow ${intervalSec}s: DB error: ${(err as Error).message}`);
      return;
    }

    if (timeline.entries.length === 0) {
      log(`shadow ${intervalSec}s: no entries, skipping`);
      return;
    }

    const rollingActivities = this.activitiesPerInterval.get(intervalMs) ?? [];
    const recentActivities = rollingActivities.slice(-10);

    const startMs = Date.now();
    let result: BatchSummaryResult | null;
    try {
      result = await this.llm.batchSummarize(
        timeline,
        this.intention,
        { durationMin: this.durationMin, batchWindowSec: Math.round(intervalMs / 1000) },
        recentActivities,
      );
    } catch (err) {
      log(`shadow ${intervalSec}s: LLM error: ${(err as Error).message}`);
      return;
    }
    const latencyMs = Date.now() - startMs;

    if (!result) {
      log(`shadow ${intervalSec}s: LLM returned null`);
      return;
    }

    const activity: RollingActivity = {
      summary: result.summary,
      timestamp: until,
      isDrifting: result.driftAssessment.isDrifting,
      confidence: result.driftAssessment.confidence,
    };
    rollingActivities.push(activity);
    if (rollingActivities.length > 100) rollingActivities.shift();

    const pricing = getModelPricing(this.llm.getModel());
    const costUsd = pricing
      ? (result.usage.inputTokens * pricing.inputPer1M + result.usage.outputTokens * pricing.outputPer1M) / 1_000_000
      : 0;

    const entry: ShadowEvalEntry = {
      interval: intervalSec,
      timestamp: until,
      summary: result.summary,
      classification: result.level2Classification,
      isDrifting: result.driftAssessment.isDrifting,
      confidence: result.driftAssessment.confidence,
      reason: result.driftAssessment.reason,
      rawActivityWindow: { since, until, entryCount: timeline.entries.length },
      tokenUsage: { input: result.usage.inputTokens, output: result.usage.outputTokens },
      latencyMs,
      costUsd,
    };

    this.logEntry(entry);
    log(`shadow ${intervalSec}s: logged result, drifting=${result.driftAssessment.isDrifting}, latency=${latencyMs}ms`);
  }
}
