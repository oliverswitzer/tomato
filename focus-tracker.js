const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'tomato.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] [focus-tracker] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

const SCREENPIPE_API = 'http://localhost:3030';
const POLL_INTERVAL_MS = 15_000;
const DRIFT_CHECK_INTERVAL_MS = 60_000;

class FocusTracker {
  constructor() {
    this.anthropic = null;
    this.apiKey = process.env.SCREENPIPE_API_KEY || '';
    this.intention = '';
    this.durationMin = 25;
    this.activities = [];
    this.keystrokeBuffer = [];
    this.pollTimer = null;
    this.driftTimer = null;
    this.onActivity = null;
    this.onDrift = null;
    this.lastPollTime = null;

    try {
      this.anthropic = new Anthropic({ dangerouslyAllowBrowser: true });
      log('Anthropic client created');
    } catch (err) {
      log(`Anthropic client error: ${err.message}`);
    }
  }

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  async searchScreenpipe(contentType, startTime, endTime, limit = 10) {
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
      return await res.json();
    } catch (err) {
      log(`Screenpipe fetch error: ${err.message}`);
      return null;
    }
  }

  async waitForScreenpipe(timeoutMs = 30000) {
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
      } catch {}
      await new Promise(r => setTimeout(r, 1000));
    }
    log('Screenpipe health check timed out');
    return false;
  }

  addKeystrokeChunk(chunk) {
    this.keystrokeBuffer.push(chunk);
    if (this.keystrokeBuffer.length > 30) this.keystrokeBuffer.shift();
  }

  buildKeystrokeContext() {
    if (this.keystrokeBuffer.length === 0) return '';
    const grouped = {};
    for (const chunk of this.keystrokeBuffer) {
      const key = `${chunk.app} — ${chunk.window}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(chunk.text);
    }
    return Object.entries(grouped)
      .map(([ctx, texts]) => `[${ctx}]\n${texts.join('')}`)
      .join('\n\n');
  }

  async buildScreenContext() {
    const now = new Date();
    const ago = new Date(now.getTime() - POLL_INTERVAL_MS);

    const [ocrData, inputData] = await Promise.all([
      this.searchScreenpipe('ocr', ago, now, 5),
      this.searchScreenpipe('input', ago, now, 20),
    ]);

    const parts = [];

    if (ocrData?.data?.length) {
      const ocrEntries = ocrData.data.map(d => {
        const c = d.content;
        const text = (c.text || '').trim().slice(0, 500);
        return `[${c.app_name} — ${c.window_name}]\n${text}`;
      });
      parts.push('## SCREEN CONTENT\n\n' + ocrEntries.join('\n\n'));
    }

    if (inputData?.data?.length) {
      const apps = new Set();
      for (const d of inputData.data) {
        const c = d.content;
        if (c.app_name) apps.add(c.app_name);
      }
      if (apps.size > 0) {
        parts.push('## ACTIVE APPS\n\n' + [...apps].join(', '));
      }
    }

    const keystrokeCtx = this.buildKeystrokeContext();
    if (keystrokeCtx) {
      parts.push('## TYPED TEXT\n\n' + keystrokeCtx);
    }

    return parts.join('\n\n');
  }

  async summarizeActivity(context) {
    if (!this.anthropic || !context.trim()) return null;

    try {
      const res = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Summarize what the user was doing in the last 15 seconds based on their screen content and typed text.

Write 1-2 short sentences. Be specific about which app and what task. Don't start with "The user was".

${context}`,
        }],
      });
      const block = res.content.find(b => b.type === 'text');
      return block ? block.text.trim() : null;
    } catch (err) {
      log(`Claude summary error: ${err.message}`);
      if (context.includes('## SCREEN CONTENT')) {
        const match = context.match(/\[(.+?) — (.+?)\]/);
        return match ? `Active in: ${match[1]}` : null;
      }
      return null;
    }
  }

  async checkDrift(recentContext) {
    if (!this.anthropic || !this.intention || !recentContext.trim()) return null;

    try {
      const res = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `The user set a focus intention: "${this.intention}"

Based on recent screen activity, are they still working on this intention or have they drifted?

Reply with exactly one of:
- "on_track" if the activity relates to the intention
- "drifted" if they seem to be doing something unrelated

Then a brief reason (1 sentence).

Recent activity:
${recentContext}`,
        }],
      });

      const block = res.content.find(b => b.type === 'text');
      if (!block) return null;

      const text = block.text.trim();
      const isDrift = text.toLowerCase().startsWith('drifted');
      return { isDrift, reason: text };
    } catch (err) {
      log(`Claude drift check error: ${err.message}`);
      return null;
    }
  }

  async tick() {
    const context = await this.buildScreenContext();

    if (!context.trim()) {
      log('Tick: no context available');
      return;
    }

    const summary = await this.summarizeActivity(context);
    if (summary) {
      const activity = {
        summary,
        timestamp: new Date().toISOString(),
        apps: this.extractApps(context),
      };
      this.activities.push(activity);
      if (this.activities.length > 100) this.activities.shift();
      log(`Activity: ${summary}`);

      if (this.onActivity) this.onActivity(activity);
    }

    this.keystrokeBuffer.length = 0;
  }

  async driftCheck() {
    const recentActivities = this.activities.slice(-4);
    if (recentActivities.length === 0) return;

    const recentContext = recentActivities
      .map(a => `- ${a.summary} (${a.apps.join(', ')})`)
      .join('\n');

    const result = await this.checkDrift(recentContext);
    if (result?.isDrift && this.onDrift) {
      log(`Drift detected: ${result.reason}`);
      this.onDrift(result.reason);
    }
  }

  extractApps(context) {
    const apps = new Set();
    const matches = context.matchAll(/\[(.+?) — /g);
    for (const m of matches) apps.add(m[1]);
    return [...apps];
  }

  async start(intention, durationMin) {
    this.intention = intention;
    this.durationMin = durationMin;
    this.activities = [];
    this.keystrokeBuffer = [];

    log(`Session started: "${intention}" for ${durationMin} min`);

    await this.waitForScreenpipe();

    await this.tick();

    this.pollTimer = setInterval(() => this.tick(), POLL_INTERVAL_MS);
    this.driftTimer = setInterval(() => this.driftCheck(), DRIFT_CHECK_INTERVAL_MS);
  }

  stop() {
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

  getActivities() {
    return [...this.activities];
  }
}

module.exports = { FocusTracker };
