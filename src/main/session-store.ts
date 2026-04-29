import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { Activity, SavedSession } from '../shared/ipc';

const STORE_PATH = path.join(app.getPath('userData'), 'sessions.json');

function readSessions(): SavedSession[] {
  try {
    const data = fs.readFileSync(STORE_PATH, 'utf8');
    return JSON.parse(data) as SavedSession[];
  } catch {
    return [];
  }
}

function writeSessions(sessions: SavedSession[]): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(sessions, null, 2));
}

export function saveSession({
  intention,
  durationMin,
  startedAt,
  activities,
  summary,
  focusScore,
}: {
  intention: string;
  durationMin: number;
  startedAt: string;
  activities: Activity[];
  summary?: string;
  focusScore?: number;
}): void {
  const endedAt = new Date().toISOString();
  const actualDurationSec = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
  const sessions = readSessions();
  sessions.push({
    intention,
    durationMin,
    actualDurationSec,
    startedAt,
    endedAt,
    activityCount: activities.length,
    summary: summary ?? (activities.length > 0 ? activities[activities.length - 1].summary : ''),
    focusScore,
  });

  if (sessions.length > 50) sessions.splice(0, sessions.length - 50);
  writeSessions(sessions);
}

export function getRecentSessions(limit = 5): SavedSession[] {
  return readSessions().slice(-limit).reverse();
}
