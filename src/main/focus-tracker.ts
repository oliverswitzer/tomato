import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import type { Activity, KeystrokeChunk } from '../shared/ipc';

const LOG_FILE = path.join(__dirname, '..', '..', 'tomato.log');
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] [focus-tracker] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

const SCREENPIPE_API = 'http://localhost:3030';
const POLL_INTERVAL_MS = 15_000;
const DRIFT_CHECK_INTERVAL_MS = 180_000;

interface ScreenpipeSearchResult {
  data?: Array<{
    content: {
      app_name: string;
      window_name: string;
      text: string;
    };
  }>;
}

export class FocusTracker {
  private anthropic: Anthropic | null = null;
  apiKey = '';
  private intention = '';
  private activities: Activity[] = [];
  private keystrokeBuffer: KeystrokeChunk[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private driftTimer: ReturnType<typeof setInterval> | null = null;
  onActivity: ((activity: Activity) => void) | null = null;
  onDrift: ((reason: string) => void) | null = null;

  constructor() {
    try {
      this.anthropic = new Anthropic({ dangerouslyAllowBrowser: true });
      log('Anthropic client created');
    } catch (err) {
      log(`Anthropic client error: ${(err as Error).message}`);
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  private async searchScreenpipe(
    contentType: string,
    startTime: Date,
    endTime: Date,
    limit = 10,
  ): Promise<ScreenpipeSearchResult | null> {
    const params = new URLSearchParams({
      q: '',
      content_type: contentType,
      limit: String(limit),
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    });

    try {
      const res = await fetch(`${SCREENPIPE_API}/search?${params}`, {
        headers: this.headers(),
      });
      if (!res.ok) {
        log(`Screenpipe API ${res.status}: ${res.statusText}`);
        return null;
      }
      return (await res.json()) as ScreenpipeSearchResult;
    } catch (err) {
      log(`Screenpipe fetch error: ${(err as Error).message}`);
      return null;
    }
  }

  private async waitForScreenpipe(timeoutMs = 30000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`${SCREENPIPE_API}/health`, {
          headers: this.headers(),
        });
        if (res.ok) {
          log('Screenpipe is ready');
          return true;
        }
      } catch {
        // keep retrying
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    log('Screenpipe health check timed out');
    return false;
  }

  addKeystrokeChunk(chunk: KeystrokeChunk): void {
    this.keystrokeBuffer.push(chunk);
    if (this.keystrokeBuffer.length > 30) this.keystrokeBuffer.shift();
  }

  private buildKeystrokeContext(): string {
    if (this.keystrokeBuffer.length === 0) return '';
    const grouped: Record<string, string[]> = {};
    for (const chunk of this.keystrokeBuffer) {
      const key = `${chunk.app} — ${chunk.window}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(chunk.text);
    }
    return Object.entries(grouped)
      .map(([ctx, texts]) => `[${ctx}]\n${texts.join('')}`)
      .join('\n\n');
  }

  private async buildScreenContext(): Promise<string> {
    const now = new Date();
    const ago = new Date(now.getTime() - POLL_INTERVAL_MS);

    const parts: string[] = [];

    const ocrData = await this.searchScreenpipe('ocr', ago, now, 5);

    if (ocrData?.data?.length) {
      const seen = new Set<string>();
      const windows: string[] = [];
      for (const d of ocrData.data) {
        const c = d.content;
        const key = `${c.app_name} — ${c.window_name}`;
        if (!seen.has(key)) {
          seen.add(key);
          windows.push(key);
        }
      }
      if (windows.length > 0) {
        parts.push('## ACTIVE WINDOWS\n\n' + windows.join('\n'));
      }
    }

    const keystrokeCtx = this.buildKeystrokeContext();
    if (keystrokeCtx) {
      parts.push('## TYPED TEXT\n\n' + keystrokeCtx);
    }

    return parts.join('\n\n');
  }

  private async summarizeActivity(context: string): Promise<string | null> {
    if (!this.anthropic || !context.trim()) return null;

    log(`--- SUMMARIZE PROMPT ---\n${context}\n--- END PROMPT ---`);

    try {
      const res = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 150,
        messages: [
          {
            role: 'user',
            content: `Summarize what the user was doing in the last 15 seconds based on their screen content and typed text.

Write 1-2 short sentences. Be specific about which app and what task. Don't start with "The user was".

${context}`,
          },
        ],
      });
      const block = res.content.find((b) => b.type === 'text');
      return block && block.type === 'text' ? block.text.trim() : null;
    } catch (err) {
      log(`Claude summary error: ${(err as Error).message}`);
      if (context.includes('## SCREEN CONTENT')) {
        const match = context.match(/\[(.+?) — (.+?)\]/);
        return match ? `Active in: ${match[1]}` : null;
      }
      return null;
    }
  }

  private async checkDrift(
    recentContext: string,
  ): Promise<{ isDrift: boolean; reason: string } | null> {
    if (!this.anthropic || !this.intention || !recentContext.trim()) return null;

    log(
      `--- DRIFT CHECK PROMPT ---\nIntention: "${this.intention}"\n${recentContext}\n--- END PROMPT ---`,
    );

    try {
      const res = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: `The user set a focus intention: "${this.intention}"

Based on recent screen activity, are they still working on this intention or have they drifted?

Reply with exactly one of:
- "on_track" if the activity relates to the intention
- "drifted" if they seem to be doing something unrelated

Then a brief reason (1 sentence).

Recent activity:
${recentContext}`,
          },
        ],
      });

      const block = res.content.find((b) => b.type === 'text');
      if (!block || block.type !== 'text') return null;

      const text = block.text.trim();
      const isDrift = text.toLowerCase().startsWith('drifted');
      log(`--- DRIFT RESPONSE ---\n${text}\n--- END RESPONSE ---`);
      return { isDrift, reason: text };
    } catch (err) {
      log(`Claude drift check error: ${(err as Error).message}`);
      return null;
    }
  }

  private extractApps(context: string): string[] {
    const apps = new Set<string>();
    const matches = context.matchAll(/\[(.+?) — /g);
    for (const m of matches) apps.add(m[1]);
    return [...apps];
  }

  private async tick(): Promise<void> {
    const context = await this.buildScreenContext();
    const apps = this.extractApps(context);
    const hasKeystrokes = context.includes('## TYPED TEXT');

    if (!context.trim()) {
      log('Tick: no context available');
      return;
    }

    if (!hasKeystrokes) {
      if (apps.length > 0) {
        const activity: Activity = {
          summary: `Active in ${apps.join(', ')}`,
          timestamp: new Date().toISOString(),
          apps,
        };
        this.activities.push(activity);
        if (this.activities.length > 100) this.activities.shift();
        log(`Tick (no keystrokes): ${activity.summary}`);
        if (this.onActivity) this.onActivity(activity);
      }
      return;
    }

    const summary = await this.summarizeActivity(context);
    if (summary) {
      const activity: Activity = {
        summary,
        timestamp: new Date().toISOString(),
        apps,
      };
      this.activities.push(activity);
      if (this.activities.length > 100) this.activities.shift();
      log(`Activity: ${summary}`);

      if (this.onActivity) this.onActivity(activity);
    }

    this.keystrokeBuffer.length = 0;
  }

  private async driftCheck(): Promise<void> {
    const cutoff = Date.now() - DRIFT_CHECK_INTERVAL_MS;
    const recentActivities = this.activities.filter(
      (a) => new Date(a.timestamp).getTime() >= cutoff,
    );
    if (recentActivities.length === 0) return;

    const recentContext = recentActivities
      .map((a) => `- ${a.summary} (${a.apps.join(', ')})`)
      .join('\n');

    const result = await this.checkDrift(recentContext);
    if (result?.isDrift && this.onDrift) {
      log(`Drift detected: ${result.reason}`);
      this.onDrift(result.reason);
    }
  }

  async start(intention: string, durationMin: number): Promise<void> {
    this.intention = intention;
    this.activities = [];
    this.keystrokeBuffer = [];

    log(`Session started: "${intention}" for ${durationMin} min`);

    await this.waitForScreenpipe();

    await this.tick();

    this.pollTimer = setInterval(() => this.tick(), POLL_INTERVAL_MS);
    this.driftTimer = setInterval(() => this.driftCheck(), DRIFT_CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.driftTimer) {
      clearInterval(this.driftTimer);
      this.driftTimer = null;
    }
    log('Session stopped');
  }

  getActivities(): Activity[] {
    return [...this.activities];
  }
}
