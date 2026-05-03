import type { ActivityTimeline } from './timeline-builder';
import type {
  LlmClient,
  BatchSummaryResult,
  SessionSummaryResult,
  TokenUsage,
} from './llm-summarizer';

export interface LlamaEngine {
  prompt(text: string): Promise<string>;
  getModelName(): string;
}

export interface LocalLlmClientOptions {
  engine: LlamaEngine;
}

export class LocalLlmClient implements LlmClient {
  private engine: LlamaEngine;
  private lastPrompt: string | null = null;

  constructor(options: LocalLlmClientOptions) {
    this.engine = options.engine;
  }

  getLastPrompt(): string | null {
    return this.lastPrompt;
  }

  getModel(): string {
    return this.engine.getModelName();
  }

  setModel(_model: string): void {
    // Local models are set at startup via model path, not swappable at runtime
  }

  async batchSummarize(
    timeline: ActivityTimeline,
    intention: string,
    sessionContext?: { durationMin: number; batchWindowSec: number },
  ): Promise<BatchSummaryResult | null> {
    const prompt = this.buildPrompt(timeline, intention, sessionContext);
    this.lastPrompt = prompt;

    try {
      const content = await this.engine.prompt(prompt);
      if (!content) return null;

      const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      return this.parseResponse(content, usage);
    } catch {
      return null;
    }
  }

  async summarizeSession(
    intention: string,
    activities: { summary: string; timestamp: string; apps: string[] }[],
    durationMin: number,
  ): Promise<SessionSummaryResult | null> {
    const activityLog =
      activities.length > 0
        ? activities
            .map((a) => {
              const time = a.timestamp.slice(11, 19);
              return `[${time}] ${a.summary} (${a.apps.join(', ')})`;
            })
            .join('\n')
        : 'No activity was recorded.';

    const prompt = `You are summarizing a completed pomodoro focus session.

## Session intention
"${intention}"

## Duration
${durationMin} minutes

## Activity log (${activities.length} entries)
${activityLog}

## Instructions
Respond with EXACTLY this JSON (no other text):
{
  "summary": "2-3 sentence summary of what the user accomplished during the entire session. Be specific about apps, files, and tasks.",
  "focusScore": 0 to 100 integer representing how focused the session was. 100 = perfectly on task the whole time, 0 = completely off task. Consider: did the activity relate to the intention? How much time was spent on-task vs off-task?
}`;

    this.lastPrompt = prompt;

    try {
      const content = await this.engine.prompt(prompt);
      if (!content) return null;

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.summary !== 'string' || typeof parsed.focusScore !== 'number') {
        return null;
      }

      return {
        summary: parsed.summary,
        focusScore: Math.max(0, Math.min(100, Math.round(parsed.focusScore))),
      };
    } catch {
      return null;
    }
  }

  private buildPrompt(
    timeline: ActivityTimeline,
    intention: string,
    sessionContext?: { durationMin: number; batchWindowSec: number },
  ): string {
    const timelineText =
      timeline.entries.length > 0
        ? timeline.entries
            .map((e) => {
              const time = e.timestamp.slice(11, 19);
              const parts = [`[${time}] ${e.app} — ${e.window}`];
              if (e.browserUrl) parts.push(`  url: ${e.browserUrl}`);
              if (e.typedText) parts.push(`  typed: "${e.typedText}"`);
              if (e.eventType === 'app_switch') parts.push('  (switched to this app)');
              if (e.eventType === 'clipboard') parts.push('  (clipboard)');
              if (e.eventType === 'passive') parts.push('  (passive consumption — no typing detected)');
              if (e.accessibilityHints.length > 0)
                parts.push(`  headings: ${e.accessibilityHints.join(', ')}`);
              return parts.join('\n');
            })
            .join('\n')
        : 'No activity detected in this time window.';

    const passiveContextSections = this.buildPassiveContextSection(timeline);

    const windowNote = sessionContext
      ? `\n\nIMPORTANT: This is a ${sessionContext.batchWindowSec}-second snapshot within a ${sessionContext.durationMin}-minute pomodoro session. You are summarizing ONLY this short window, not the entire session. A brief distraction in a ${sessionContext.batchWindowSec}-second window does not mean the user failed — they may have been focused for the other ${sessionContext.durationMin - 1} minutes. Be proportionate in your assessment.`
      : '';

    return `You are a focus-tracking assistant for a pomodoro session.

## Important context about the data
The typed text comes from raw keystroke capture. It includes typos, misspellings, partial words, and backspace artifacts. This is NORMAL human typing — do not interpret typos or messy text as evidence of distraction or lack of focus. Judge focus based on WHICH APP the user is in and WHAT THEY ARE DOING, not on typing quality.

## How to assess drift
Drift means the user shifted to activity UNRELATED to their intention. Use these rules:

1. **App-switching speed is NOT a drift signal.** Rapidly switching between project-related tools (editor, browser with docs/PRs/CI, terminal, project management) is normal workflow — especially for developers doing research-driven work. Never flag switch frequency or velocity alone.
2. **Judge by app and content relevance.** Ask: "Could this app/page plausibly support the stated intention?" If yes, it is NOT drift. Examples of on-task activity regardless of switch speed:
   - Browsing GitHub PRs, issues, or code related to the project
   - Reading documentation, Stack Overflow, or technical blogs
   - Checking CI/CD results or deployment dashboards
   - Switching between an editor (VS Code, Cursor, Vim) and a browser with references
   - Using a terminal, database client, API testing tool, or DevTools
   - Using project management tools (Linear, Jira, Notion) related to the work
3. **Flag drift only when apps are clearly unrelated to the intention.** Examples: social media feeds, entertainment/streaming, shopping, personal messaging unrelated to work, gaming. The content must be unambiguously off-task — not merely ambiguous.
4. **When uncertain, classify as NOT drifting** with moderate confidence. False positives (flagging on-task work as drift) are worse than false negatives (missing brief off-task moments) because they interrupt flow and erode trust.

## Session intention
"${intention}"

## Activity timeline (${timeline.startTime} to ${timeline.endTime})
Apps used: ${timeline.uniqueApps.join(', ') || 'none'}
Most active: ${timeline.dominantApp || 'none'}

${timelineText}${passiveContextSections}${windowNote}

## Anti-hallucination rule
Only describe content that is directly present in the provided context. Do not infer or fabricate video titles, article names, or page content that is not explicitly shown.

## Instructions
Analyze the activity in this window and respond with EXACTLY this JSON (no other text):
{
  "summary": "1-2 sentence summary of what the user did in this window",
  "level2Classification": "one of: Building | Research | Marketing | User Validation | Admin | Communication | Off-task",
  "driftAssessment": {
    "isDrifting": true or false,
    "confidence": 0.0 to 1.0,
    "reason": "brief explanation"
  }
}`;
  }

  private buildPassiveContextSection(timeline: ActivityTimeline): string {
    const allUrls: string[] = [];
    const allScreenTexts: string[] = [];
    const allClickTargets: string[] = [];

    for (const e of timeline.entries) {
      if (!e.passiveContext) continue;
      for (const url of e.passiveContext.urls) {
        if (!allUrls.includes(url)) allUrls.push(url);
      }
      if (e.passiveContext.screenText) {
        allScreenTexts.push(e.passiveContext.screenText);
      }
      for (const ct of e.passiveContext.clickTargets) {
        if (!allClickTargets.includes(ct)) allClickTargets.push(ct);
      }
    }

    if (allUrls.length === 0 && allScreenTexts.length === 0 && allClickTargets.length === 0) {
      return '';
    }

    const parts = ['\n\n## Passive Context (from screen capture)'];
    if (allUrls.length > 0) {
      parts.push(`URLs visited: ${allUrls.join(', ')}`);
    }
    if (allScreenTexts.length > 0) {
      parts.push(`Screen text: ${allScreenTexts[0].slice(0, 200)}`);
    }
    if (allClickTargets.length > 0) {
      parts.push(`Click targets: ${allClickTargets.join(', ')}`);
    }
    return parts.join('\n');
  }

  private parseResponse(text: string, usage: TokenUsage): BatchSummaryResult | null {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);

      if (
        typeof parsed.summary !== 'string' ||
        typeof parsed.level2Classification !== 'string' ||
        !parsed.driftAssessment
      ) {
        return null;
      }

      return {
        summary: parsed.summary,
        level2Classification: parsed.level2Classification,
        driftAssessment: {
          isDrifting: Boolean(parsed.driftAssessment.isDrifting),
          confidence: Number(parsed.driftAssessment.confidence) || 0,
          reason: String(parsed.driftAssessment.reason || ''),
        },
        usage,
      };
    } catch {
      return null;
    }
  }
}
