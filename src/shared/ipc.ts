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
  actualDurationSec?: number;
  startedAt: string;
  endedAt: string;
  activityCount: number;
  summary: string;
  focusScore?: number;
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

export interface TimelineEntryIpc {
  timestamp: string;
  app: string;
  window: string;
  typedText: string | null;
  eventType: 'typing' | 'app_switch' | 'clipboard' | 'idle';
  accessibilityHints: string[];
  browserUrl: string | null;
}

export interface PollState {
  timestamp: string;
  activeApp: string;
  windowTitle: string;
  screenpipeStatus: 'ok' | 'error' | 'unavailable';
}

export interface DebugPipelineState {
  currentPollState: PollState | null;
  lastTickTime: string | null;
  pendingLlmCall: boolean;
  lastLlmPromptPreview: string | null;
  lastBatchResult: {
    summary: string;
    level2Classification: string;
    isDrifting: boolean;
  } | null;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  error?: string;
  retryable?: boolean;
  selectedModel?: string;
}

export interface OnboardingState {
  hasApiKey: boolean;
  selectedModel: string | null;
}

export interface ModelInfo {
  id: string;
  priceTier: '$' | '$$' | '$$$';
  inputPer1M: number | null;
  outputPer1M: number | null;
}

export interface SettingsState {
  hasApiKey: boolean;
  maskedKey: string | null;
  selectedModel: string | null;
}

export interface ApiErrorEvent {
  type: 'auth' | 'model_deprecated';
  message: string;
}

export interface TomatoApi {
  startSession(intention: string, durationMin: number): void;
  togglePause(): void;
  endSession(): void;
  timerResize(expanded: boolean): void;
  timerReady(): void;
  closeStart(): void;
  nudgeRefocus(): void;
  nudgePause(): void;

  getSessionState(): Promise<SessionStateWithActivities>;
  getRecentSessions(): Promise<SavedSession[]>;
  getScreenPermission(): Promise<boolean>;
  getAccessibilityPermission(): Promise<boolean>;
  openScreenPermissionSettings(): void;
  openAccessibilityPermissionSettings(): void;
  permissionsComplete(): void;
  capture(): Promise<CaptureResult>;
  getDebugPipelineState(): Promise<DebugPipelineState | null>;

  validateApiKey(key: string): Promise<ApiKeyValidationResult>;
  saveApiKey(key: string, selectedModel: string): Promise<{ success: boolean; error?: string }>;
  getOnboardingState(): Promise<OnboardingState>;
  apiKeyComplete(): void;

  fetchModels(): Promise<{ models: ModelInfo[]; error?: string }>;
  getSettingsState(): Promise<SettingsState>;
  updateModel(modelId: string): void;
  quitApp(): void;
  openSettings(): void;
  closeSettings(): void;

  onShowSettings(callback: () => void): () => void;
  onApiError(callback: (data: ApiErrorEvent) => void): () => void;

  onSessionState(callback: (state: SessionStateWithActivities) => void): () => void;
  onActivityUpdate(callback: (activity: Activity) => void): () => void;
  onDriftDetected(callback: (data: { reason: string; confidence: number; level2Classification: string }) => void): () => void;
  onSessionEnded(callback: () => void): () => void;
  onTimelineUpdate(callback: (entries: TimelineEntryIpc[]) => void): () => void;
}

declare global {
  interface Window {
    tomato: TomatoApi;
  }
}
