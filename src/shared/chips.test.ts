import { describe, it, expect } from 'vitest';
import type { SavedSession } from './ipc';
import { deriveRecentChips } from './chips';

function session(intention: string): SavedSession {
  return {
    intention,
    durationMin: 25,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    activityCount: 0,
    summary: '',
  };
}

describe('deriveRecentChips', () => {
  it('returns 3 chips from 3+ sessions with unique intentions', () => {
    const sessions = [
      session('Finish landing page'),
      session('Write tests'),
      session('Review PRs'),
      session('Deploy to staging'),
    ];
    expect(deriveRecentChips(sessions)).toEqual([
      'Finish landing page',
      'Write tests',
      'Review PRs',
    ]);
  });

  it('deduplicates repeated intentions', () => {
    const sessions = [
      session('Finish landing page'),
      session('Finish landing page'),
      session('Write tests'),
      session('Finish landing page'),
      session('Review PRs'),
    ];
    expect(deriveRecentChips(sessions)).toEqual([
      'Finish landing page',
      'Write tests',
      'Review PRs',
    ]);
  });

  it('returns empty array for 0 sessions (triggers fallback)', () => {
    expect(deriveRecentChips([])).toEqual([]);
  });

  it('returns 1 chip when only 1 unique intention exists', () => {
    const sessions = [
      session('Finish landing page'),
      session('Finish landing page'),
    ];
    expect(deriveRecentChips(sessions)).toEqual(['Finish landing page']);
  });

  it('returns 2 chips when only 2 unique intentions exist', () => {
    const sessions = [
      session('Finish landing page'),
      session('Write tests'),
      session('Finish landing page'),
    ];
    expect(deriveRecentChips(sessions)).toEqual([
      'Finish landing page',
      'Write tests',
    ]);
  });

  it('preserves most-recent-first order from input', () => {
    const sessions = [
      session('Deploy to staging'),
      session('Write tests'),
      session('Deploy to staging'),
      session('Finish landing page'),
    ];
    expect(deriveRecentChips(sessions)).toEqual([
      'Deploy to staging',
      'Write tests',
      'Finish landing page',
    ]);
  });
});
