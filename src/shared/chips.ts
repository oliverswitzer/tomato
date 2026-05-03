import type { SavedSession } from './ipc';

export function deriveRecentChips(sessions: SavedSession[]): string[] {
  const unique = [...new Set(sessions.map(s => s.intention))];
  return unique.slice(0, 3);
}
