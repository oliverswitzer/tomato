import { describe, it, expect, vi } from 'vitest';
import { SqliteScreenpipeDb } from '../screenpipe-db';
import type { SqliteDatabase } from '../screenpipe-db';

function createMockDb(tables: Record<string, Record<string, unknown>[]> = {}): SqliteDatabase {
  return {
    prepare(sql: string) {
      return {
        all(..._params: unknown[]) {
          for (const [key, rows] of Object.entries(tables)) {
            if (sql.includes(key)) return rows;
          }
          return [];
        },
        get(..._params: unknown[]) {
          for (const [key, rows] of Object.entries(tables)) {
            if (sql.includes(key)) return rows[rows.length - 1];
          }
          return undefined;
        },
      };
    },
    close: vi.fn(),
  };
}

describe('SqliteScreenpipeDb', () => {
  describe('getTextEvents', () => {
    it('returns text events with app_name and window_title', () => {
      const mockDb = createMockDb({
        ui_events: [
          { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'hello world', app_name: 'Cursor', window_title: 'main.ts' },
        ],
      });
      const db = new SqliteScreenpipeDb(mockDb);

      const events = db.getTextEvents('2026-04-25T10:00:00Z', '2026-04-25T10:00:10Z');
      expect(events).toHaveLength(1);
      expect(events[0].text_content).toBe('hello world');
      expect(events[0].app_name).toBe('Cursor');
      expect(events[0].window_title).toBe('main.ts');
    });

    it('returns empty array when no events in time range', () => {
      const mockDb = createMockDb({ ui_events: [] });
      const db = new SqliteScreenpipeDb(mockDb);

      const events = db.getTextEvents('2026-04-25T10:00:00Z', '2026-04-25T10:00:10Z');
      expect(events).toEqual([]);
    });
  });

  describe('getAppSwitches', () => {
    it('returns app_switch events', () => {
      const mockDb = createMockDb({
        ui_events: [
          { id: 1, timestamp: '2026-04-25T10:00:05Z', app_name: 'Firefox', window_title: 'GitHub' },
        ],
      });
      const db = new SqliteScreenpipeDb(mockDb);

      const switches = db.getAppSwitches('2026-04-25T10:00:00Z', '2026-04-25T10:00:10Z');
      expect(switches).toHaveLength(1);
      expect(switches[0].app_name).toBe('Firefox');
      expect(switches[0].window_title).toBe('GitHub');
    });
  });

  describe('getClipboardEvents', () => {
    it('returns clipboard events with text', () => {
      const mockDb = createMockDb({
        ui_events: [
          { id: 1, timestamp: '2026-04-25T10:00:05Z', text_content: 'copied text' },
        ],
      });
      const db = new SqliteScreenpipeDb(mockDb);

      const events = db.getClipboardEvents('2026-04-25T10:00:00Z', '2026-04-25T10:00:10Z');
      expect(events).toHaveLength(1);
      expect(events[0].text_content).toBe('copied text');
    });
  });

  describe('getLatestFrame', () => {
    it('returns the most recent frame', () => {
      const mockDb = createMockDb({
        frames: [
          { id: 1, timestamp: '2026-04-25T10:00:01Z', app_name: 'Cursor', window_name: 'old.ts', focused: true, browser_url: null },
          { id: 2, timestamp: '2026-04-25T10:00:05Z', app_name: 'Firefox', window_name: 'GitHub', focused: true, browser_url: null },
        ],
      });
      const db = new SqliteScreenpipeDb(mockDb);

      const frame = db.getLatestFrame();
      expect(frame).not.toBeNull();
      expect(frame!.app_name).toBe('Firefox');
    });

    it('returns null when no frames exist', () => {
      const mockDb = createMockDb({});
      const db = new SqliteScreenpipeDb(mockDb);

      expect(db.getLatestFrame()).toBeNull();
    });
  });

  describe('getAccessibilityElements', () => {
    it('returns elements matching query', () => {
      const mockDb = createMockDb({
        elements: [
          { frame_id: 1, role: 'AXHeading', text: 'My Section', app_name: 'Cursor', timestamp: '2026-04-25T10:00:05Z' },
        ],
      });
      const db = new SqliteScreenpipeDb(mockDb);

      const elements = db.getAccessibilityElements('2026-04-25T10:00:00Z', '2026-04-25T10:00:10Z');
      expect(elements).toHaveLength(1);
      expect(elements[0].role).toBe('AXHeading');
      expect(elements[0].text).toBe('My Section');
    });
  });

  describe('isHealthy', () => {
    it('returns false when no recent frames', () => {
      const mockDb = createMockDb({});
      const db = new SqliteScreenpipeDb(mockDb);
      expect(db.isHealthy()).toBe(false);
    });

    it('returns true when frames exist', () => {
      const mockDb = createMockDb({
        frames: [{ id: 1, timestamp: new Date().toISOString(), app_name: 'Cursor', window_name: 'test' }],
      });
      const db = new SqliteScreenpipeDb(mockDb);
      expect(db.isHealthy()).toBe(true);
    });
  });

  describe('getPassiveFrames', () => {
    it('returns frames with screen text and browser URL', () => {
      const mockDb = createMockDb({
        frames: [
          { id: 1, timestamp: '2026-04-25T10:00:05Z', app_name: 'Google Chrome', window_name: 'How i book 3-5 meetings a day Cold Calling - YouTube - Audio playing - Google Chrome - Oliver', browser_url: 'https://www.youtube.com/watch?v=tU52nLIUz8Y', screen_text: 'How i book 3-5 meetings a day\nCold Calling ($319,000/month web design agency)\nChrome File Edit View', capture_trigger: 'idle' },
          { id: 2, timestamp: '2026-04-25T10:00:20Z', app_name: 'Google Chrome', window_name: 'How i book 3-5 meetings a day Cold Calling - YouTube - Audio playing - Google Chrome - Oliver', browser_url: 'https://www.youtube.com/watch?v=tU52nLIUz8Y', screen_text: 'How i book 3-5 meetings a day\nCold Calling ($319,000/month web design agency)\n2:35 / 14:22', capture_trigger: 'visual_change' },
        ],
      });
      const db = new SqliteScreenpipeDb(mockDb);

      const frames = db.getPassiveFrames('2026-04-25T10:00:00Z', '2026-04-25T10:01:00Z');
      expect(frames).toHaveLength(2);
      expect(frames[0].browser_url).toBe('https://www.youtube.com/watch?v=tU52nLIUz8Y');
      expect(frames[0].screen_text).toContain('Cold Calling');
      expect(frames[0].capture_trigger).toBe('idle');
    });

    it('returns empty array when no frames in range', () => {
      const mockDb = createMockDb({});
      const db = new SqliteScreenpipeDb(mockDb);

      const frames = db.getPassiveFrames('2026-04-25T10:00:00Z', '2026-04-25T10:01:00Z');
      expect(frames).toEqual([]);
    });
  });

  describe('getClickEvents', () => {
    it('returns click events with element names', () => {
      const mockDb = createMockDb({
        ui_events: [
          { id: 1, timestamp: '2026-04-25T10:00:05Z', app_name: 'Google Chrome', window_title: 'chore: Developer ID signing by oliverswitzer · Pull Request #15 · oliverswitzer/tomato - Google Chrome - Oliver', element_name: 'Merge pull request' },
          { id: 2, timestamp: '2026-04-25T10:00:10Z', app_name: 'Google Chrome', window_title: 'chore: Developer ID signing by oliverswitzer · Pull Request #15 · oliverswitzer/tomato - Google Chrome - Oliver', element_name: 'Confirm merge' },
        ],
      });
      const db = new SqliteScreenpipeDb(mockDb);

      const clicks = db.getClickEvents('2026-04-25T10:00:00Z', '2026-04-25T10:01:00Z');
      expect(clicks).toHaveLength(2);
      expect(clicks[0].element_name).toBe('Merge pull request');
      expect(clicks[1].element_name).toBe('Confirm merge');
    });

    it('returns empty array when no click events in range', () => {
      const mockDb = createMockDb({});
      const db = new SqliteScreenpipeDb(mockDb);

      const clicks = db.getClickEvents('2026-04-25T10:00:00Z', '2026-04-25T10:01:00Z');
      expect(clicks).toEqual([]);
    });
  });

  describe('close', () => {
    it('delegates to underlying db', () => {
      const mockDb = createMockDb({});
      const db = new SqliteScreenpipeDb(mockDb);
      db.close();
      expect(mockDb.close).toHaveBeenCalled();
    });
  });
});
