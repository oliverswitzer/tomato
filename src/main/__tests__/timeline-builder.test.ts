import { describe, it, expect, vi } from 'vitest';
import { TimelineBuilder } from '../timeline-builder';
import type { ScreenpipeDb, TextEventRow, AppSwitchRow, ClipboardRow, FrameRow, AccessibilityElementRow } from '../screenpipe-db';

function mockDb(overrides: Partial<{
  textEvents: TextEventRow[];
  appSwitches: AppSwitchRow[];
  clipboardEvents: ClipboardRow[];
  frames: FrameRow[];
  a11yElements: AccessibilityElementRow[];
}> = {}): ScreenpipeDb {
  return {
    getTextEvents: vi.fn().mockReturnValue(overrides.textEvents ?? []),
    getAppSwitches: vi.fn().mockReturnValue(overrides.appSwitches ?? []),
    getClipboardEvents: vi.fn().mockReturnValue(overrides.clipboardEvents ?? []),
    getLatestFrame: vi.fn().mockReturnValue(null),
    getFrames: vi.fn().mockReturnValue(overrides.frames ?? []),
    getAccessibilityElements: vi.fn().mockReturnValue(overrides.a11yElements ?? []),
    isHealthy: vi.fn().mockReturnValue(true),
    close: vi.fn(),
  };
}

describe('TimelineBuilder', () => {
  const builder = new TimelineBuilder();
  const since = '2026-04-25T10:00:00Z';
  const until = '2026-04-25T10:03:00Z';

  it('creates timeline entries from text events with app context', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'hello world', app_name: 'Cursor', window_title: 'main.ts' },
        { id: 2, timestamp: '2026-04-25T10:00:10Z', text_content: 'const x = 1', app_name: 'Firefox', window_title: 'GitHub' },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries).toHaveLength(2);
    expect(timeline.entries[0].app).toBe('Cursor');
    expect(timeline.entries[0].window).toBe('main.ts');
    expect(timeline.entries[0].typedText).toBe('hello world');
    expect(timeline.entries[0].eventType).toBe('typing');
    expect(timeline.entries[1].app).toBe('Firefox');
  });

  it('merges app_switch events into timeline', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'typing here', app_name: 'Cursor', window_title: 'main.ts' },
      ],
      appSwitches: [
        { id: 2, timestamp: '2026-04-25T10:00:08Z', app_name: 'Firefox', window_title: 'GitHub' },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries).toHaveLength(2);
    expect(timeline.entries[0].eventType).toBe('typing');
    expect(timeline.entries[1].eventType).toBe('app_switch');
    expect(timeline.entries[1].app).toBe('Firefox');
  });

  it('includes clipboard events', () => {
    const db = mockDb({
      clipboardEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'copied code' },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries).toHaveLength(1);
    expect(timeline.entries[0].eventType).toBe('clipboard');
    expect(timeline.entries[0].typedText).toBe('copied code');
  });

  it('attaches accessibility hints to typing entries by app', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'searching', app_name: 'Google Chrome', window_title: 'MDN' },
      ],
      a11yElements: [
        { frame_id: 100, role: 'AXHeading', text: 'Array.prototype.map()', app_name: 'Google Chrome' },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries[0].accessibilityHints).toContain('Array.prototype.map()');
  });

  it('sorts all entries by timestamp', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:10Z', text_content: 'second', app_name: 'Cursor', window_title: 'a.ts' },
      ],
      appSwitches: [
        { id: 2, timestamp: '2026-04-25T10:00:05Z', app_name: 'Firefox', window_title: 'GitHub' },
      ],
      clipboardEvents: [
        { id: 3, timestamp: '2026-04-25T10:00:08Z', text_content: 'copied' },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries[0].timestamp).toBe('2026-04-25T10:00:05Z');
    expect(timeline.entries[1].timestamp).toBe('2026-04-25T10:00:08Z');
    expect(timeline.entries[2].timestamp).toBe('2026-04-25T10:00:10Z');
  });

  it('computes dominantApp from frame counts', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'hello', app_name: 'Cursor', window_title: 'a.ts' },
      ],
      frames: [
        { id: 1, timestamp: '2026-04-25T10:00:01Z', app_name: 'Cursor', window_name: 'a.ts', focused: true, browser_url: null },
        { id: 2, timestamp: '2026-04-25T10:00:02Z', app_name: 'Cursor', window_name: 'a.ts', focused: true, browser_url: null },
        { id: 3, timestamp: '2026-04-25T10:00:03Z', app_name: 'Firefox', window_name: 'GitHub', focused: true, browser_url: null },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.dominantApp).toBe('Cursor');
  });

  it('computes uniqueApps as deduplicated list', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'hello', app_name: 'Cursor', window_title: 'a.ts' },
        { id: 2, timestamp: '2026-04-25T10:00:06Z', text_content: 'world', app_name: 'Cursor', window_title: 'b.ts' },
        { id: 3, timestamp: '2026-04-25T10:00:07Z', text_content: 'test', app_name: 'Firefox', window_title: 'MDN' },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.uniqueApps).toEqual(['Cursor', 'Firefox']);
  });

  it('handles empty time window', () => {
    const db = mockDb();

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries).toEqual([]);
    expect(timeline.uniqueApps).toEqual([]);
    expect(timeline.dominantApp).toBe('');
  });

  it('handles null app_name in text events', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'orphan text', app_name: null, window_title: null },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries).toHaveLength(1);
    expect(timeline.entries[0].app).toBe('unknown');
  });

  it('deduplicates accessibility hints per app', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'hello', app_name: 'Chrome', window_title: 'MDN' },
      ],
      a11yElements: [
        { frame_id: 1, role: 'AXHeading', text: 'Same Heading', app_name: 'Chrome' },
        { frame_id: 2, role: 'AXHeading', text: 'Same Heading', app_name: 'Chrome' },
        { frame_id: 3, role: 'AXHeading', text: 'Different', app_name: 'Chrome' },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries[0].accessibilityHints).toEqual(['Same Heading', 'Different']);
  });

  it('collapses consecutive typing events in the same app+window into one entry with concatenated text and time range', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'So what do these raw ', app_name: 'Cursor', window_title: 'main.ts' },
        { id: 2, timestamp: '2026-04-25T10:00:07Z', text_content: 'table ', app_name: 'Cursor', window_title: 'main.ts' },
        { id: 3, timestamp: '2026-04-25T10:00:08Z', text_content: 'rows ', app_name: 'Cursor', window_title: 'main.ts' },
        { id: 4, timestamp: '2026-04-25T10:00:11Z', text_content: 'get translated to in our app?', app_name: 'Cursor', window_title: 'main.ts' },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries).toHaveLength(1);
    expect(timeline.entries[0].typedText).toBe('So what do these raw table rows get translated to in our app?');
    expect(timeline.entries[0].timestamp).toBe('2026-04-25T10:00:05Z');
    expect(timeline.entries[0].timestampEnd).toBe('2026-04-25T10:00:11Z');
    expect(timeline.entries[0].app).toBe('Cursor');
    expect(timeline.entries[0].window).toBe('main.ts');
  });

  it('does not collapse typing events when app changes between them', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'hello', app_name: 'Cursor', window_title: 'main.ts' },
        { id: 2, timestamp: '2026-04-25T10:00:07Z', text_content: 'world', app_name: 'Messages', window_title: 'Mom Belfrey' },
        { id: 3, timestamp: '2026-04-25T10:00:09Z', text_content: 'back here', app_name: 'Cursor', window_title: 'main.ts' },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    const typingEntries = timeline.entries.filter(e => e.eventType === 'typing');
    expect(typingEntries).toHaveLength(3);
    expect(typingEntries[0].typedText).toBe('hello');
    expect(typingEntries[1].typedText).toBe('world');
    expect(typingEntries[2].typedText).toBe('back here');
  });

  it('does not collapse typing events when window changes within the same app', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'first file', app_name: 'Cursor', window_title: 'a.ts' },
        { id: 2, timestamp: '2026-04-25T10:00:07Z', text_content: 'second file', app_name: 'Cursor', window_title: 'b.ts' },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    const typingEntries = timeline.entries.filter(e => e.eventType === 'typing');
    expect(typingEntries).toHaveLength(2);
  });

  it('populates browserUrl on typing entries from text event browser_url', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'searching', app_name: 'Google Chrome', window_title: 'Stack Overflow', browser_url: 'https://stackoverflow.com/questions/123' },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries[0].browserUrl).toBe('https://stackoverflow.com/questions/123');
  });

  it('leaves browserUrl null for non-browser typing entries', () => {
    const db = mockDb({
      textEvents: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'coding', app_name: 'Cursor', window_title: 'main.ts', browser_url: null },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries[0].browserUrl).toBeNull();
  });

  it('populates browserUrl on app_switch entries from matching frames', () => {
    const db = mockDb({
      appSwitches: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', app_name: 'Google Chrome', window_title: 'GitHub' },
      ],
      frames: [
        { id: 1, timestamp: '2026-04-25T10:00:03Z', app_name: 'Google Chrome', window_name: 'GitHub', focused: true, browser_url: 'https://github.com/org/repo' },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries[0].browserUrl).toBe('https://github.com/org/repo');
  });

  it('leaves browserUrl null on app_switch entries for non-browser apps', () => {
    const db = mockDb({
      appSwitches: [
        { id: 1, timestamp: '2026-04-25T10:00:05Z', app_name: 'Cursor', window_title: 'main.ts' },
      ],
      frames: [
        { id: 1, timestamp: '2026-04-25T10:00:03Z', app_name: 'Cursor', window_name: 'main.ts', focused: true, browser_url: null },
      ],
    });

    const timeline = builder.buildFromDb(db, since, until);

    expect(timeline.entries[0].browserUrl).toBeNull();
  });
});
