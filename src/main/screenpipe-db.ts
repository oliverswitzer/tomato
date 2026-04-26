import type Database from 'better-sqlite3';

export interface SqliteDatabase {
  prepare(sql: string): { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown };
  close(): void;
}

export interface TextEventRow {
  id: number;
  timestamp: string;
  text_content: string;
  app_name: string | null;
  window_title: string | null;
}

export interface AppSwitchRow {
  id: number;
  timestamp: string;
  app_name: string;
  window_title: string;
}

export interface ClipboardRow {
  id: number;
  timestamp: string;
  text_content: string;
}

export interface FrameRow {
  id: number;
  timestamp: string;
  app_name: string;
  window_name: string;
  focused: boolean | null;
  browser_url: string | null;
}

export interface AccessibilityElementRow {
  frame_id: number;
  role: string;
  text: string;
  app_name: string;
}

export interface ScreenpipeDb {
  getTextEvents(since: string, until: string): TextEventRow[];
  getAppSwitches(since: string, until: string): AppSwitchRow[];
  getClipboardEvents(since: string, until: string): ClipboardRow[];
  getLatestFrame(): FrameRow | null;
  getFrames(since: string, until: string, limit?: number): FrameRow[];
  getAccessibilityElements(
    since: string,
    until: string,
    roles?: string[],
  ): AccessibilityElementRow[];
  isHealthy(): boolean;
  close(): void;
}

export class SqliteScreenpipeDb implements ScreenpipeDb {
  private db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  getTextEvents(since: string, until: string): TextEventRow[] {
    // Try direct app_name first (patched screenpipe), fall back to cross-ref join
    const rows = this.db
      .prepare(
        `SELECT t.id, t.timestamp, t.text_content,
           COALESCE(t.app_name, f.app_name) as app_name,
           COALESCE(t.window_title, f.window_name) as window_title
         FROM ui_events t
         LEFT JOIN frames f ON abs(strftime('%s', t.timestamp) - strftime('%s', f.timestamp)) < 5
           AND f.app_name IS NOT NULL
         WHERE t.event_type = 'text'
           AND t.text_content IS NOT NULL AND length(t.text_content) > 3
           AND t.timestamp BETWEEN ? AND ?
         GROUP BY t.id
         ORDER BY t.timestamp ASC`,
      )
      .all(since, until) as TextEventRow[];
    return rows;
  }

  getAppSwitches(since: string, until: string): AppSwitchRow[] {
    return this.db
      .prepare(
        `SELECT id, timestamp, app_name, window_title
         FROM ui_events
         WHERE event_type = 'app_switch'
           AND timestamp BETWEEN ? AND ?
         ORDER BY timestamp ASC`,
      )
      .all(since, until) as AppSwitchRow[];
  }

  getClipboardEvents(since: string, until: string): ClipboardRow[] {
    return this.db
      .prepare(
        `SELECT id, timestamp, text_content
         FROM ui_events
         WHERE event_type = 'clipboard'
           AND text_content IS NOT NULL AND text_content != ''
           AND timestamp BETWEEN ? AND ?
         ORDER BY timestamp ASC`,
      )
      .all(since, until) as ClipboardRow[];
  }

  getLatestFrame(): FrameRow | null {
    const row = this.db
      .prepare(
        `SELECT id, timestamp, app_name, window_name, focused, browser_url
         FROM frames
         WHERE app_name IS NOT NULL
         ORDER BY id DESC LIMIT 1`,
      )
      .get() as FrameRow | undefined;
    return row ?? null;
  }

  getFrames(since: string, until: string, limit = 10): FrameRow[] {
    return this.db
      .prepare(
        `SELECT id, timestamp, app_name, window_name, focused, browser_url
         FROM frames
         WHERE app_name IS NOT NULL
           AND timestamp BETWEEN ? AND ?
         ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(since, until, limit) as FrameRow[];
  }

  getAccessibilityElements(
    since: string,
    until: string,
    roles: string[] = ['AXHeading', 'AXTextField', 'AXTextArea'],
  ): AccessibilityElementRow[] {
    const placeholders = roles.map(() => '?').join(',');
    return this.db
      .prepare(
        `SELECT e.frame_id, e.role, e.text, f.app_name
         FROM elements e
         JOIN frames f ON e.frame_id = f.id
         WHERE e.source = 'accessibility'
           AND e.role IN (${placeholders})
           AND e.text IS NOT NULL AND length(e.text) > 2
           AND f.timestamp BETWEEN ? AND ?
         ORDER BY f.timestamp DESC
         LIMIT 30`,
      )
      .all(...roles, since, until) as AccessibilityElementRow[];
  }

  isHealthy(): boolean {
    try {
      const row = this.db
        .prepare(
          `SELECT id FROM frames
           WHERE timestamp >= datetime('now', '-30 seconds')
           LIMIT 1`,
        )
        .get();
      return row !== undefined;
    } catch {
      return false;
    }
  }

  close(): void {
    this.db.close();
  }
}
