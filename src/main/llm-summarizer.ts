import type Anthropic from '@anthropic-ai/sdk';
import type { ActivityTimeline } from './timeline-builder';

export interface BatchSummaryResult {
  summary: string;
  level2Classification: string;
  driftAssessment: {
    isDrifting: boolean;
    confidence: number;
    reason: string;
  };
}

export interface SessionSummaryResult {
  summary: string;
  focusScore: number;
}

export interface LlmClient {
  batchSummarize(
    timeline: ActivityTimeline,
    intention: string,
    sessionContext?: { durationMin: number; batchWindowSec: number },
  ): Promise<BatchSummaryResult | null>;
  summarizeSession(
    intention: string,
    activities: { summary: string; timestamp: string; apps: string[] }[],
    durationMin: number,
  ): Promise<SessionSummaryResult | null>;
  getLastPrompt(): string | null;
}

export class AnthropicLlmClient implements LlmClient {
  private lastPrompt: string | null = null;

  constructor(private anthropic: Anthropic, private model: string = 'claude-haiku-4-5') {}

  async batchSummarize(
    timeline: ActivityTimeline,
    intention: string,
    sessionContext?: { durationMin: number; batchWindowSec: number },
  ): Promise<BatchSummaryResult | null> {
    const prompt = this.buildPrompt(timeline, intention, sessionContext);
    this.lastPrompt = prompt;

    try {
      const res = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });

      const block = res.content.find((b) => b.type === 'text');
      if (!block || block.type !== 'text') return null;

      return this.parseResponse(block.text);
    } catch {
      return null;
    }
  }

  getLastPrompt(): string | null {
    return this.lastPrompt;
  }

  private buildPrompt(timeline: ActivityTimeline, intention: string, sessionContext?: { durationMin: number; batchWindowSec: number }): string {
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
              if (e.accessibilityHints.length > 0)
                parts.push(`  headings: ${e.accessibilityHints.join(', ')}`);
              return parts.join('\n');
            })
            .join('\n')
        : 'No activity detected in this time window.';

    const windowNote = sessionContext
      ? `\n\nIMPORTANT: This is a ${sessionContext.batchWindowSec}-second snapshot within a ${sessionContext.durationMin}-minute pomodoro session. You are summarizing ONLY this short window, not the entire session. A brief distraction in a ${sessionContext.batchWindowSec}-second window does not mean the user failed — they may have been focused for the other ${sessionContext.durationMin - 1} minutes. Be proportionate in your assessment.`
      : '';

    return `You are a focus-tracking assistant for a pomodoro session.

## Important context about the data
The typed text comes from raw keystroke capture. It includes typos, misspellings, partial words, and backspace artifacts. This is NORMAL human typing — do not interpret typos or messy text as evidence of distraction or lack of focus. Judge focus based on WHICH APP the user is in and WHAT THEY ARE DOING, not on typing quality.

## Session intention
"${intention}"

## Activity timeline (${timeline.startTime} to ${timeline.endTime})
Apps used: ${timeline.uniqueApps.join(', ') || 'none'}
Most active: ${timeline.dominantApp || 'none'}

${timelineText}${windowNote}

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

  private parseResponse(text: string): BatchSummaryResult | null {
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
      };
    } catch {
      return null;
    }
  }

  async summarizeSession(
    intention: string,
    activities: { summary: string; timestamp: string; apps: string[] }[],
    durationMin: number,
  ): Promise<SessionSummaryResult | null> {
    const activityLog = activities.length > 0
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
      const res = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });

      const block = res.content.find((b) => b.type === 'text');
      if (!block || block.type !== 'text') return null;

      const jsonMatch = block.text.match(/\{[\s\S]*\}/);
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
}
