import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockAutoUpdater, mockNotification } = vi.hoisted(() => {
  const mockAutoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    logger: null as unknown,
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
  };
  const mockNotification = vi.fn();
  return { mockAutoUpdater, mockNotification };
});

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '0.2.0' },
  Notification: class {
    constructor(opts: { title: string; body: string }) {
      mockNotification(opts);
    }
    show = vi.fn();
  },
}));

import {
  initAutoUpdater,
  checkForUpdates,
  quitAndInstall,
  getUpdateStatus,
  onUpdateStatus,
  stopAutoUpdater,
} from '../auto-updater';

describe('auto-updater', () => {
  let eventHandlers: Record<string, (...args: unknown[]) => void>;
  const logs: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    eventHandlers = {};
    logs.length = 0;
    mockAutoUpdater.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers[event] = handler;
    });
    mockAutoUpdater.checkForUpdates.mockResolvedValue(undefined);
    mockNotification.mockClear();
  });

  afterEach(() => {
    stopAutoUpdater();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('registers all expected event handlers on init', () => {
    initAutoUpdater((msg) => logs.push(msg));

    expect(mockAutoUpdater.on).toHaveBeenCalledWith('checking-for-update', expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('update-available', expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('update-not-available', expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('download-progress', expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('update-downloaded', expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('configures autoDownload and autoInstallOnAppQuit', () => {
    initAutoUpdater((msg) => logs.push(msg));

    expect(mockAutoUpdater.autoDownload).toBe(true);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  it('checks for updates on launch', () => {
    initAutoUpdater((msg) => logs.push(msg));

    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.includes('launch'))).toBe(true);
  });

  it('checks for updates periodically (every 4 hours)', () => {
    initAutoUpdater((msg) => logs.push(msg));

    mockAutoUpdater.checkForUpdates.mockClear();
    vi.advanceTimersByTime(4 * 60 * 60 * 1000);
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('manual check triggers checkForUpdates', () => {
    initAutoUpdater((msg) => logs.push(msg));
    mockAutoUpdater.checkForUpdates.mockClear();

    checkForUpdates('manual');

    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.includes('manual'))).toBe(true);
  });

  it('skips check when already checking', () => {
    initAutoUpdater((msg) => logs.push(msg));

    eventHandlers['checking-for-update']();
    expect(getUpdateStatus().state).toBe('checking');

    mockAutoUpdater.checkForUpdates.mockClear();
    checkForUpdates('manual');
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('sets status to available when update found', () => {
    initAutoUpdater((msg) => logs.push(msg));

    eventHandlers['update-available']({ version: '1.0.0' });
    expect(getUpdateStatus()).toEqual({ state: 'available', version: '1.0.0' });
  });

  it('resets status to idle when no update available', () => {
    initAutoUpdater((msg) => logs.push(msg));

    eventHandlers['checking-for-update']();
    eventHandlers['update-not-available']({ version: '0.2.0' });
    expect(getUpdateStatus().state).toBe('idle');
  });

  it('tracks download progress', () => {
    initAutoUpdater((msg) => logs.push(msg));

    eventHandlers['download-progress']({ percent: 42 });
    expect(getUpdateStatus()).toEqual({ state: 'downloading', progress: 42 });
  });

  it('sets downloaded status and shows notification', () => {
    initAutoUpdater((msg) => logs.push(msg));

    eventHandlers['update-downloaded']({ version: '1.0.0' });
    expect(getUpdateStatus()).toEqual({ state: 'downloaded', version: '1.0.0' });
    expect(mockNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Tomato Update Ready' }),
    );
  });

  it('sets error status on failure', () => {
    initAutoUpdater((msg) => logs.push(msg));

    eventHandlers['error'](new Error('Network failed'));
    expect(getUpdateStatus()).toEqual({ state: 'error', error: 'Network failed' });
  });

  it('notifies listeners on status change', () => {
    initAutoUpdater((msg) => logs.push(msg));

    const statuses: unknown[] = [];
    onUpdateStatus((s) => statuses.push(s));

    eventHandlers['update-available']({ version: '1.0.0' });
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toEqual({ state: 'available', version: '1.0.0' });
  });

  it('unsubscribe removes listener', () => {
    initAutoUpdater((msg) => logs.push(msg));

    const statuses: unknown[] = [];
    const unsub = onUpdateStatus((s) => statuses.push(s));
    unsub();

    eventHandlers['update-available']({ version: '1.0.0' });
    expect(statuses).toHaveLength(0);
  });

  it('quitAndInstall delegates to autoUpdater', () => {
    initAutoUpdater((msg) => logs.push(msg));

    quitAndInstall();
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('stopAutoUpdater clears periodic timer', () => {
    initAutoUpdater((msg) => logs.push(msg));
    stopAutoUpdater();

    mockAutoUpdater.checkForUpdates.mockClear();
    vi.advanceTimersByTime(4 * 60 * 60 * 1000);
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('handles checkForUpdates rejection gracefully', async () => {
    initAutoUpdater((msg) => logs.push(msg));
    mockAutoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('offline'));

    checkForUpdates('manual');
    await vi.advanceTimersByTimeAsync(0);

    expect(getUpdateStatus()).toEqual({ state: 'error', error: 'offline' });
  });
});
