import type { ScreenpipeDb } from './screenpipe-db';

export interface TimelineEntry {
  timestamp: string;
  timestampEnd?: string;
  app: string;
  window: string;
  typedText: string | null;
  eventType: 'typing' | 'app_switch' | 'clipboard' | 'idle';
  accessibilityHints: string[];
  browserUrl: string | null;
}

export interface ActivityTimeline {
  entries: TimelineEntry[];
  startTime: string;
  endTime: string;
  uniqueApps: string[];
  dominantApp: string;
}

export class TimelineBuilder {
  buildFromDb(db: ScreenpipeDb, since: string, until: string): ActivityTimeline {
    const textEvents = db.getTextEvents(since, until);
    const appSwitches = db.getAppSwitches(since, until);
    const clipboardEvents = db.getClipboardEvents(since, until);
    const a11yElements = db.getAccessibilityElements(since, until, ['AXHeading']);
    const frames = db.getFrames(since, until, 50);

    const raw: TimelineEntry[] = [];

    const a11yByApp = new Map<string, string[]>();
    for (const el of a11yElements) {
      const hints = a11yByApp.get(el.app_name) ?? [];
      if (!hints.includes(el.text)) {
        hints.push(el.text);
      }
      a11yByApp.set(el.app_name, hints);
    }

    for (const ev of textEvents) {
      const app = ev.app_name ?? 'unknown';
      raw.push({
        timestamp: ev.timestamp,
        app,
        window: ev.window_title ?? '',
        typedText: ev.text_content,
        eventType: 'typing',
        accessibilityHints: a11yByApp.get(app) ?? [],
        browserUrl: null,
      });
    }

    for (const sw of appSwitches) {
      raw.push({
        timestamp: sw.timestamp,
        app: sw.app_name,
        window: sw.window_title ?? '',
        typedText: null,
        eventType: 'app_switch',
        accessibilityHints: [],
        browserUrl: null,
      });
    }

    for (const cb of clipboardEvents) {
      raw.push({
        timestamp: cb.timestamp,
        app: '',
        window: '',
        typedText: cb.text_content,
        eventType: 'clipboard',
        accessibilityHints: [],
        browserUrl: null,
      });
    }

    raw.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const entries = this.collapseConsecutive(raw);

    const appFrameCounts = new Map<string, number>();
    for (const f of frames) {
      appFrameCounts.set(f.app_name, (appFrameCounts.get(f.app_name) ?? 0) + 1);
    }

    const uniqueApps = [...new Set(entries.map((e) => e.app).filter((a) => a !== ''))];

    let dominantApp = '';
    let maxFrames = 0;
    for (const [app, count] of appFrameCounts) {
      if (count > maxFrames) {
        maxFrames = count;
        dominantApp = app;
      }
    }
    if (!dominantApp && uniqueApps.length > 0) {
      dominantApp = uniqueApps[0];
    }

    return {
      entries,
      startTime: since,
      endTime: until,
      uniqueApps,
      dominantApp,
    };
  }

  private collapseConsecutive(entries: TimelineEntry[]): TimelineEntry[] {
    if (entries.length === 0) return [];

    const collapsed: TimelineEntry[] = [];
    let current = { ...entries[0] };

    for (let i = 1; i < entries.length; i++) {
      const next = entries[i];

      if (
        current.eventType === 'typing' &&
        next.eventType === 'typing' &&
        current.app === next.app &&
        current.window === next.window
      ) {
        current.typedText = (current.typedText ?? '') + (next.typedText ?? '');
        current.timestampEnd = next.timestamp;
      } else {
        collapsed.push(current);
        current = { ...next };
      }
    }

    collapsed.push(current);
    return collapsed;
  }
}
