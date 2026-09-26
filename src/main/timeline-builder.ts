import type { ScreenpipeDb, PassiveFrameRow, ClickEventRow } from './screenpipe-db';

interface PassiveContext {
  urls: string[];
  screenText: string | null;
  clickTargets: string[];
}

export interface TimelineEntry {
  timestamp: string;
  timestampEnd?: string;
  app: string;
  window: string;
  typedText: string | null;
  eventType: 'typing' | 'app_switch' | 'clipboard' | 'idle' | 'passive';
  accessibilityHints: string[];
  browserUrl: string | null;
  passiveContext?: PassiveContext;
}

export interface ActivityTimeline {
  entries: TimelineEntry[];
  startTime: string;
  endTime: string;
  uniqueApps: string[];
  dominantApp: string;
}

const MIN_NOVEL_SCREEN_TEXT_CHARS = 40;

function normalizeScreenTextLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function removeRepeatedScreenLines(
  screenText: string | null,
  previousAppScreenText: string | null | undefined,
): string | null {
  if (!screenText) return null;
  if (!previousAppScreenText) return screenText;

  const previousLines = new Set(
    previousAppScreenText
      .split('\n')
      .map((line) => normalizeScreenTextLine(line))
      .filter((line) => line.length > 0),
  );

  if (previousLines.size === 0) return screenText;

  const novelLines = screenText
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      const normalized = normalizeScreenTextLine(line);
      return normalized.length > 0 && !previousLines.has(normalized);
    });

  const novelText = novelLines.join('\n').trim();
  if (novelText.length >= MIN_NOVEL_SCREEN_TEXT_CHARS) return novelText;
  return screenText;
}

function uniqueNonNullStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => value != null))];
}

function getFrameWithBestScreenText(frames: PassiveFrameRow[]): PassiveFrameRow | null {
  return frames.reduce<PassiveFrameRow | null>((best, frame) => {
    if (!frame.screen_text) return best;
    if (!best?.screen_text || frame.screen_text.length > best.screen_text.length) return frame;
    return best;
  }, null);
}

function buildPassiveContext(frames: PassiveFrameRow[], clickEvents: ClickEventRow[]): PassiveContext {
  const frameWithBestText = getFrameWithBestScreenText(frames);
  return {
    urls: uniqueNonNullStrings(frames.map((frame) => frame.browser_url)),
    screenText: removeRepeatedScreenLines(
      frameWithBestText?.screen_text ?? null,
      frameWithBestText?.previous_app_screen_text,
    ),
    clickTargets: uniqueNonNullStrings(clickEvents.map((clickEvent) => clickEvent.element_name)),
  };
}

export class TimelineBuilder {
  buildFromDb(db: ScreenpipeDb, since: string, until: string): ActivityTimeline {
    const textEvents = db.getTextEvents(since, until);
    const appSwitches = db.getAppSwitches(since, until);
    const clipboardEvents = db.getClipboardEvents(since, until);
    const a11yElements = db.getAccessibilityElements(since, until, ['AXHeading']);
    const frames = db.getFrames(since, until, 50);
    const passiveFrames = db.getPassiveFrames(since, until);
    const clickEvents = db.getClickEvents(since, until);

    const raw: TimelineEntry[] = [];
    const hasActiveEvents = textEvents.length > 0 || appSwitches.length > 0;

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
        browserUrl: ev.browser_url ?? null,
      });
    }

    const frameBrowserUrls = new Map<string, string>();
    for (const f of frames) {
      if (f.browser_url) {
        frameBrowserUrls.set(`${f.app_name}\0${f.window_name}`, f.browser_url);
      }
    }

    for (const sw of appSwitches) {
      raw.push({
        timestamp: sw.timestamp,
        app: sw.app_name,
        window: sw.window_title ?? '',
        typedText: null,
        eventType: 'app_switch',
        accessibilityHints: [],
        browserUrl: frameBrowserUrls.get(`${sw.app_name}\0${sw.window_title ?? ''}`) ?? null,
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

    if (!hasActiveEvents && passiveFrames.length > 0) {
      this.buildPassiveEntries(passiveFrames, clickEvents, raw);
    }

    raw.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    let entries = this.collapseConsecutive(raw);

    if (hasActiveEvents && passiveFrames.length > 0) {
      entries = this.enrichWithPassiveContext(entries, passiveFrames, clickEvents);
    }

    const appFrameCounts = new Map<string, number>();
    for (const f of frames) {
      appFrameCounts.set(f.app_name, (appFrameCounts.get(f.app_name) ?? 0) + 1);
    }
    for (const f of passiveFrames) {
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

  private buildPassiveEntries(
    passiveFrames: PassiveFrameRow[],
    clickEvents: ClickEventRow[],
    raw: TimelineEntry[],
  ): void {
    const grouped = new Map<string, PassiveFrameRow[]>();
    for (const f of passiveFrames) {
      const key = `${f.app_name}\0${f.window_name}`;
      const group = grouped.get(key) ?? [];
      group.push(f);
      grouped.set(key, group);
    }

    for (const [, group] of grouped) {
      const first = group[0];
      const last = group[group.length - 1];
      const passiveContext = buildPassiveContext(
        group,
        clickEvents.filter((clickEvent) => clickEvent.app_name === first.app_name),
      );

      raw.push({
        timestamp: first.timestamp,
        timestampEnd: group.length > 1 ? last.timestamp : undefined,
        app: first.app_name,
        window: first.window_name,
        typedText: null,
        eventType: 'passive',
        accessibilityHints: [],
        browserUrl: passiveContext.urls[0] ?? null,
        passiveContext,
      });
    }
  }

  private enrichWithPassiveContext(
    entries: TimelineEntry[],
    passiveFrames: PassiveFrameRow[],
    clickEvents: ClickEventRow[],
  ): TimelineEntry[] {
    return entries.map((entry) => {
      const entryStart = entry.timestamp;
      const entryEnd = entry.timestampEnd ?? entry.timestamp;

      const overlapping = passiveFrames.filter(
        (f) => f.app_name === entry.app && f.timestamp >= entryStart && f.timestamp <= entryEnd,
      );

      if (overlapping.length === 0) return entry;

      const passiveContext = buildPassiveContext(
        overlapping,
        clickEvents.filter(
          (clickEvent) =>
            clickEvent.app_name === entry.app &&
            clickEvent.timestamp >= entryStart &&
            clickEvent.timestamp <= entryEnd,
        ),
      );

      return {
        ...entry,
        browserUrl: entry.browserUrl ?? passiveContext.urls[0] ?? null,
        passiveContext,
      };
    });
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
