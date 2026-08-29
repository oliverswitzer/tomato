import { create } from 'zustand';
import type { Activity, SessionStateWithActivities, ApiErrorEvent } from '@shared/ipc';

const ACTIVITY_CAP = 100;

export type DriftInfo = { reason: string; confidence: number; level2Classification: string } | null;

export interface SessionStoreState {
  state: SessionStateWithActivities;
  activities: Activity[];
  driftInfo: DriftInfo;
  apiError: ApiErrorEvent | null;
  sessionEnded: boolean;

  setSessionState: (s: SessionStateWithActivities) => void;
  addActivity: (activity: Activity) => void;
  setDriftInfo: (data: DriftInfo) => void;
  setSessionEnded: (ended: boolean) => void;
  setApiError: (data: ApiErrorEvent | null) => void;
  reset: () => void;
}

const initialState: SessionStateWithActivities = {
  active: false,
  intention: '',
  durationMin: 25,
  remainingSec: 1500,
  paused: false,
  activities: [],
};

export const useSessionStore = create<SessionStoreState>((set) => ({
  state: initialState,
  activities: [],
  driftInfo: null,
  apiError: null,
  sessionEnded: false,

  setSessionState: (s) =>
    set((prev) => ({
      state: s,
      activities: s.activities && s.activities.length > 0 ? s.activities : prev.activities,
    })),

  addActivity: (activity) =>
    set((prev) => {
      const next = [...prev.activities, activity];
      return {
        activities: next.length > ACTIVITY_CAP ? next.slice(1) : next,
        driftInfo: null,
      };
    }),

  setDriftInfo: (data) => set({ driftInfo: data }),

  setSessionEnded: (ended) => set({ sessionEnded: ended }),

  setApiError: (data) => set({ apiError: data }),

  reset: () =>
    set({
      state: initialState,
      activities: [],
      driftInfo: null,
      apiError: null,
      sessionEnded: false,
    }),
}));

let unsubscribeFns: Array<() => void> | null = null;

/**
 * Wires the main-process IPC push events into the session store. Call once
 * from App.tsx — not per-page — so page navigation doesn't re-subscribe or
 * lose accumulated state. Returns an unsubscribe function.
 */
export function initSessionStore(): () => void {
  if (unsubscribeFns) {
    // Already initialized; return a no-op-safe unsubscribe of the existing
    // subscriptions rather than double-subscribing.
    const existing = unsubscribeFns;
    return () => existing.forEach((fn) => fn());
  }

  const { setSessionState, addActivity, setDriftInfo, setSessionEnded, setApiError } =
    useSessionStore.getState();

  unsubscribeFns = [
    window.tomato.onSessionState(setSessionState),
    window.tomato.onActivityUpdate(addActivity),
    window.tomato.onDriftDetected(setDriftInfo),
    window.tomato.onSessionEnded(() => setSessionEnded(true)),
    window.tomato.onApiError(setApiError),
  ];

  return () => {
    unsubscribeFns?.forEach((fn) => fn());
    unsubscribeFns = null;
  };
}
