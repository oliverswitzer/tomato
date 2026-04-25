import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { TomatoApi, SessionStateWithActivities, Activity } from '../shared/ipc';

const api: TomatoApi = {
  startSession: (intention, durationMin) =>
    ipcRenderer.send('start-session', { intention, durationMin }),
  togglePause: () => ipcRenderer.send('toggle-pause'),
  endSession: () => ipcRenderer.send('end-session'),
  hudResize: (expanded) => ipcRenderer.send('hud-resize', { expanded }),
  hudReady: () => ipcRenderer.send('hud-ready'),
  closeStart: () => ipcRenderer.send('close-start'),
  nudgeRefocus: () => ipcRenderer.send('nudge-refocus'),
  nudgePause: () => ipcRenderer.send('nudge-pause'),

  getSessionState: () => ipcRenderer.invoke('get-session-state'),
  getRecentSessions: () => ipcRenderer.invoke('get-recent-sessions'),
  capture: () => ipcRenderer.invoke('capture'),

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
    const handler = (_e: IpcRendererEvent, data: { reason: string }) => callback(data);
    ipcRenderer.on('drift-detected', handler);
    return () => { ipcRenderer.removeListener('drift-detected', handler); };
  },
  onSessionEnded: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('session-ended', handler);
    return () => { ipcRenderer.removeListener('session-ended', handler); };
  },
};

contextBridge.exposeInMainWorld('tomato', api);
