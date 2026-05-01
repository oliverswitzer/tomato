import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { TomatoApi, SessionStateWithActivities, Activity, TimelineEntryIpc, ApiErrorEvent } from '../shared/ipc';

const api: TomatoApi = {
  startSession: (intention, durationMin) =>
    ipcRenderer.send('start-session', { intention, durationMin }),
  togglePause: () => ipcRenderer.send('toggle-pause'),
  endSession: () => ipcRenderer.send('end-session'),
  timerResize: (expanded) => ipcRenderer.send('timer-resize', { expanded }),
  timerReady: () => ipcRenderer.send('timer-ready'),
  closeStart: () => ipcRenderer.send('close-start'),
  nudgeRefocus: () => ipcRenderer.send('nudge-refocus'),
  nudgePause: () => ipcRenderer.send('nudge-pause'),

  getSessionState: () => ipcRenderer.invoke('get-session-state'),
  getRecentSessions: () => ipcRenderer.invoke('get-recent-sessions'),
  getScreenPermission: () => ipcRenderer.invoke('get-screen-permission'),
  getAccessibilityPermission: () => ipcRenderer.invoke('get-accessibility-permission'),
  openScreenPermissionSettings: () => ipcRenderer.send('open-screen-permission-settings'),
  openAccessibilityPermissionSettings: () => ipcRenderer.send('open-accessibility-permission-settings'),
  permissionsComplete: () => ipcRenderer.send('permissions-complete'),
  capture: () => ipcRenderer.invoke('capture'),
  getDebugPipelineState: () => ipcRenderer.invoke('get-debug-pipeline-state'),

  validateApiKey: (key: string) => ipcRenderer.invoke('validate-api-key', key),
  saveApiKey: (key: string, selectedModel: string) => ipcRenderer.invoke('save-api-key', key, selectedModel),
  getOnboardingState: () => ipcRenderer.invoke('get-onboarding-state'),
  apiKeyComplete: () => ipcRenderer.send('api-key-complete'),

  fetchModels: () => ipcRenderer.invoke('fetch-models'),
  getSettingsState: () => ipcRenderer.invoke('get-settings-state'),
  updateModel: (modelId: string) => ipcRenderer.send('update-model', { modelId }),
  quitApp: () => ipcRenderer.send('quit-app'),
  openSettings: () => ipcRenderer.send('open-settings'),
  closeSettings: () => ipcRenderer.send('close-settings'),

  onShowSettings: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('show-settings', handler);
    return () => { ipcRenderer.removeListener('show-settings', handler); };
  },
  onApiError: (callback) => {
    const handler = (_e: IpcRendererEvent, data: ApiErrorEvent) => callback(data);
    ipcRenderer.on('api-error', handler);
    return () => { ipcRenderer.removeListener('api-error', handler); };
  },

  onSessionState: (callback) => {
    const handler = (_e: IpcRendererEvent, state: SessionStateWithActivities) => callback(state);
    ipcRenderer.on('session-state', handler);
    return () => { ipcRenderer.removeListener('session-state', handler); };
  },
  onActivityUpdate: (callback) => {
    const handler = (_e: IpcRendererEvent, activity: Activity) => callback(activity);
    ipcRenderer.on('activity-update', handler);
    return () => { ipcRenderer.removeListener('activity-update', handler); };
  },
  onDriftDetected: (callback) => {
    const handler = (_e: IpcRendererEvent, data: { reason: string; confidence: number; level2Classification: string }) => callback(data);
    ipcRenderer.on('drift-detected', handler);
    return () => { ipcRenderer.removeListener('drift-detected', handler); };
  },
  onSessionEnded: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('session-ended', handler);
    return () => { ipcRenderer.removeListener('session-ended', handler); };
  },
  onTimelineUpdate: (callback) => {
    const handler = (_e: IpcRendererEvent, entries: TimelineEntryIpc[]) => callback(entries);
    ipcRenderer.on('timeline-update', handler);
    return () => { ipcRenderer.removeListener('timeline-update', handler); };
  },
};

contextBridge.exposeInMainWorld('tomato', api);
