const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const STORE_PATH = path.join(
  app.getPath('userData'),
  'sessions.json'
);

function readSessions() {
  try {
    const data = fs.readFileSync(STORE_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeSessions(sessions) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(sessions, null, 2));
}

function saveSession({ intention, durationMin, activities }) {
  const sessions = readSessions();
  sessions.push({
    intention,
    durationMin,
    startedAt: new Date(Date.now() - durationMin * 60_000).toISOString(),
    endedAt: new Date().toISOString(),
    activityCount: activities.length,
    summary: activities.length > 0
      ? activities[activities.length - 1].summary
      : '',
  });

  // Keep last 50 sessions
  if (sessions.length > 50) sessions.splice(0, sessions.length - 50);
  writeSessions(sessions);
}

function getRecentSessions(limit = 5) {
  return readSessions().slice(-limit).reverse();
}

module.exports = { saveSession, getRecentSessions };
