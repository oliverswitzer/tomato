export interface SessionState {
  active: boolean;
  intention: string;
  durationMin: number;
  remainingSec: number;
  paused: boolean;
}

export interface Activity {
  summary: string;
  timestamp: string;
  apps: string[];
}

export interface SessionStateWithActivities extends SessionState {
  activities: Activity[];
}

export interface SavedSession {
  intention: string;
  durationMin: number;
  startedAt: string;
  endedAt: string;
  activityCount: number;
  summary: string;
}

export interface ScreenpipeFrame {
  app: string;
  window: string;
  text: string;
  timestamp: string;
  focused: boolean;
}

export interface CaptureResult {
  frames?: ScreenpipeFrame[];
  error?: string;
}

export interface KeystrokeChunk {
  type: 'keystroke_chunk';
  text: string;
  app: string;
  window: string;
  timestamp: string;
}

export interface TomatoApi {
  startSession(intention: string, durationMin: number): void;
  togglePause(): void;
  endSession(): void;
  hudResize(expanded: boolean): void;
  hudReady(): void;
  closeStart(): void;
  nudgeRefocus(): void;
  nudgePause(): void;

  getSessionState(): Promise<SessionStateWithActivities>;
  getRecentSessions(): Promise<SavedSession[]>;
  capture(): Promise<CaptureResult>;

  onSessionState(callback: (state: SessionStateWithActivities) => void): () => void;
  onActivityUpdate(callback: (activity: Activity) => void): () => void;
  onDriftDetected(callback: (data: { reason: string }) => void): () => void;
  onSessionEnded(callback: () => void): () => void;
}

declare global {
  interface Window {
    tomato: TomatoApi;
  }
}
