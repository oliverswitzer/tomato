import { autoUpdater, UpdateInfo } from 'electron-updater';
import { app, Notification } from 'electron';

export type UpdateTrigger = 'launch' | 'periodic' | 'manual';

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  progress?: number;
  error?: string;
}

type StatusListener = (status: UpdateStatus) => void;

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

let currentStatus: UpdateStatus = { state: 'idle' };
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let statusListeners: StatusListener[] = [];
let logFn: (msg: string) => void = () => {};

function setStatus(status: UpdateStatus): void {
  currentStatus = status;
  for (const listener of statusListeners) {
    listener(status);
  }
}

export function onUpdateStatus(listener: StatusListener): () => void {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== listener);
  };
}

export function getUpdateStatus(): UpdateStatus {
  return currentStatus;
}

export function initAutoUpdater(logger: (msg: string) => void): void {
  logFn = logger;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => {
    logFn('Checking for update...');
    setStatus({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logFn(`Update available: ${info.version}`);
    setStatus({ state: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', (_info: UpdateInfo) => {
    logFn('App is up to date');
    setStatus({ state: 'idle' });
  });

  autoUpdater.on('download-progress', (progress) => {
    logFn(`Download progress: ${Math.round(progress.percent)}%`);
    setStatus({ state: 'downloading', progress: progress.percent });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logFn(`Update downloaded: ${info.version}`);
    setStatus({ state: 'downloaded', version: info.version });

    const notification = new Notification({
      title: 'Tomato Update Ready',
      body: `Version ${info.version} has been downloaded. Restart to apply.`,
    });
    notification.show();
  });

  autoUpdater.on('error', (err: Error) => {
    logFn(`Update error: ${err.message}`);
    setStatus({ state: 'error', error: err.message });
  });

  checkForUpdates('launch');

  periodicTimer = setInterval(() => {
    checkForUpdates('periodic');
  }, CHECK_INTERVAL_MS);
}

export function checkForUpdates(trigger: UpdateTrigger): void {
  logFn(`Update check triggered: ${trigger} (current: ${app.getVersion()})`);

  if (currentStatus.state === 'checking' || currentStatus.state === 'downloading') {
    logFn('Update check already in progress, skipping');
    return;
  }

  autoUpdater.checkForUpdates().catch((err: Error) => {
    logFn(`Update check failed: ${err.message}`);
    setStatus({ state: 'error', error: err.message });
  });
}

export function quitAndInstall(): void {
  logFn('Quitting and installing update');
  autoUpdater.quitAndInstall();
}

export function stopAutoUpdater(): void {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
  statusListeners = [];
}
