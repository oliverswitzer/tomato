import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../sessionStore';
import type { Activity, SessionStateWithActivities } from '@shared/ipc';

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    summary: 'did a thing',
    timestamp: new Date().toISOString(),
    apps: ['Chrome'],
    isDrifting: false,
    confidence: 0.9,
    ...overrides,
  };
}

function makeSessionState(overrides: Partial<SessionStateWithActivities> = {}): SessionStateWithActivities {
  return {
    active: true,
    intention: 'write code',
    durationMin: 25,
    remainingSec: 1200,
    paused: false,
    activities: [],
    ...overrides,
  };
}

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('has sane initial state', () => {
    const s = useSessionStore.getState();
    expect(s.state.active).toBe(false);
    expect(s.state.durationMin).toBe(25);
    expect(s.activities).toEqual([]);
    expect(s.driftInfo).toBeNull();
    expect(s.apiError).toBeNull();
    expect(s.sessionEnded).toBe(false);
  });

  it('setSessionState updates state and replaces activities when provided', () => {
    const activities = [makeActivity(), makeActivity()];
    useSessionStore.getState().setSessionState(makeSessionState({ activities }));

    const s = useSessionStore.getState();
    expect(s.state.intention).toBe('write code');
    expect(s.activities).toEqual(activities);
  });

  it('setSessionState keeps existing activities when the incoming payload has none', () => {
    useSessionStore.getState().addActivity(makeActivity({ summary: 'first' }));
    useSessionStore.getState().setSessionState(makeSessionState({ activities: [] }));

    const s = useSessionStore.getState();
    expect(s.activities).toHaveLength(1);
    expect(s.activities[0].summary).toBe('first');
  });

  it('addActivity appends to the activity list', () => {
    useSessionStore.getState().addActivity(makeActivity({ summary: 'one' }));
    useSessionStore.getState().addActivity(makeActivity({ summary: 'two' }));

    const s = useSessionStore.getState();
    expect(s.activities.map((a) => a.summary)).toEqual(['one', 'two']);
  });

  it('caps the activity list at 100 entries, dropping the oldest', () => {
    for (let i = 0; i < 105; i++) {
      useSessionStore.getState().addActivity(makeActivity({ summary: `activity-${i}` }));
    }

    const s = useSessionStore.getState();
    expect(s.activities).toHaveLength(100);
    expect(s.activities[0].summary).toBe('activity-5');
    expect(s.activities[99].summary).toBe('activity-104');
  });

  it('addActivity clears drift info (new activity resets drift)', () => {
    useSessionStore.getState().setDriftInfo({ reason: 'off track', confidence: 0.8, level2Classification: 'social_media' });
    expect(useSessionStore.getState().driftInfo).not.toBeNull();

    useSessionStore.getState().addActivity(makeActivity());
    expect(useSessionStore.getState().driftInfo).toBeNull();
  });

  it('setDriftInfo sets and clears drift info', () => {
    useSessionStore.getState().setDriftInfo({ reason: 'twitter', confidence: 0.7, level2Classification: 'social_media' });
    expect(useSessionStore.getState().driftInfo?.reason).toBe('twitter');

    useSessionStore.getState().setDriftInfo(null);
    expect(useSessionStore.getState().driftInfo).toBeNull();
  });

  it('setSessionEnded flips the flag', () => {
    useSessionStore.getState().setSessionEnded(true);
    expect(useSessionStore.getState().sessionEnded).toBe(true);
  });

  it('setApiError sets and clears the api error', () => {
    useSessionStore.getState().setApiError({ type: 'auth', message: 'bad key' });
    expect(useSessionStore.getState().apiError?.type).toBe('auth');

    useSessionStore.getState().setApiError(null);
    expect(useSessionStore.getState().apiError).toBeNull();
  });

  it('reset restores initial state', () => {
    useSessionStore.getState().addActivity(makeActivity());
    useSessionStore.getState().setDriftInfo({ reason: 'x', confidence: 0.5, level2Classification: 'y' });
    useSessionStore.getState().setApiError({ type: 'auth', message: 'bad' });
    useSessionStore.getState().setSessionEnded(true);
    useSessionStore.getState().incrementResume();
    useSessionStore.getState().setLastPreDriftActivity({ app: 'Chrome', window: 'Twitter', intention: 'write code' });

    useSessionStore.getState().reset();

    const s = useSessionStore.getState();
    expect(s.activities).toEqual([]);
    expect(s.driftInfo).toBeNull();
    expect(s.apiError).toBeNull();
    expect(s.sessionEnded).toBe(false);
    expect(s.resumeCount).toBe(0);
    expect(s.lastPreDriftActivity).toBeNull();
  });

  it('has resumeCount 0 and no lastPreDriftActivity initially', () => {
    const s = useSessionStore.getState();
    expect(s.resumeCount).toBe(0);
    expect(s.lastPreDriftActivity).toBeNull();
  });

  it('incrementResume bumps the counter by one each call', () => {
    useSessionStore.getState().incrementResume();
    expect(useSessionStore.getState().resumeCount).toBe(1);

    useSessionStore.getState().incrementResume();
    useSessionStore.getState().incrementResume();
    expect(useSessionStore.getState().resumeCount).toBe(3);
  });

  it('setLastPreDriftActivity sets and clears the pre-drift snapshot', () => {
    useSessionStore.getState().setLastPreDriftActivity({
      app: 'VS Code',
      window: 'onboarding.md',
      intention: 'write onboarding docs',
    });

    const s = useSessionStore.getState();
    expect(s.lastPreDriftActivity).toEqual({
      app: 'VS Code',
      window: 'onboarding.md',
      intention: 'write onboarding docs',
    });

    useSessionStore.getState().setLastPreDriftActivity(null);
    expect(useSessionStore.getState().lastPreDriftActivity).toBeNull();
  });
});
