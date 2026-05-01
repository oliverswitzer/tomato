import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  screen,
  ipcMain,
  nativeImage,
  shell,
  desktopCapturer,
  systemPreferences,
} from 'electron';
import { spawn, execFileSync, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { FocusTracker } from './focus-tracker';
import Database from 'better-sqlite3';
import { SqliteScreenpipeDb } from './screenpipe-db';
import { AnthropicLlmClient } from './llm-summarizer';
import { saveSession, getRecentSessions } from './session-store';
import { ElectronKeychainStore } from './keychain';
import { validateApiKey } from './api-key-validator';
import { DEFAULT_MODEL, getPriceTier, getModelPricing } from '../config/model-pricing';
import type { SessionState } from '../shared/ipc';

const APP_ROOT = path.join(__dirname, '..', '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function getLogPath(): string {
  try {
    return path.join(app.getPath('userData'), 'tomato.log');
  } catch {
    return path.join(APP_ROOT, 'tomato.log');
  }
}

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] [main] ${msg}\n`;
  fs.appendFileSync(getLogPath(), line);
}

let keychain: ElectronKeychainStore | null = null;

let tray: Tray | null = null;
let startWin: BrowserWindow | null = null;
let timerWin: BrowserWindow | null = null;
let nudgeWin: BrowserWindow | null = null;
let screenpipeProc: ChildProcess | null = null;
let focusTracker: FocusTracker | null = null;
let db: import('./screenpipe-db').ScreenpipeDb | null = null;

let sessionState: SessionState = {
  active: false,
  intention: '',
  durationMin: 25,
  remainingSec: 0,
  paused: false,
};
let sessionStartedAt: string | null = null;

function getPreloadPath(): string {
  return path.join(__dirname, '..', 'preload', 'preload.js');
}

function loadRendererPage(win: BrowserWindow, hash: string): void {
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(`${VITE_DEV_SERVER_URL}#${hash}`);
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { hash });
  }
}

// --- Screenpipe lifecycle ---

function resolveScreenpipeBin(): string {
  if (process.env.SCREENPIPE_BIN) return process.env.SCREENPIPE_BIN;

  // Bundled binary inside the app (packaged with electron-builder)
  const bundled = path.join(process.resourcesPath, 'screenpipe');
  if (fs.existsSync(bundled)) return bundled;

  // Local dev: check bin/ directory
  const local = path.join(APP_ROOT, 'bin', 'screenpipe');
  if (fs.existsSync(local)) return local;

  // Fallback: npm package
  const platform = `${process.platform}-${process.arch}`;
  const pkgMap: Record<string, string> = {
    'darwin-arm64': '@screenpipe/cli-darwin-arm64',
    'darwin-x64': '@screenpipe/cli-darwin-x64',
    'linux-x64': '@screenpipe/cli-linux-x64',
    'win32-x64': '@screenpipe/cli-win32-x64',
  };
  const pkg = pkgMap[platform];
  if (!pkg) throw new Error(`Unsupported platform: ${platform}`);

  const pkgJson = require.resolve(`${pkg}/package.json`);
  const ext = process.platform === 'win32' ? '.exe' : '';
  return path.join(path.dirname(pkgJson), 'bin', `screenpipe${ext}`);
}

function getScreenpipeApiKey(bin: string): string {
  try {
    return execFileSync(bin, ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function startScreenpipe(): void {
  let bin: string;
  try {
    bin = resolveScreenpipeBin();
  } catch (err) {
    log(`Could not resolve screenpipe binary: ${(err as Error).message}`);
    return;
  }

  const apiKey = getScreenpipeApiKey(bin);
  if (apiKey) {
    process.env.SCREENPIPE_API_KEY = apiKey;
    log(`Resolved screenpipe API key: ${apiKey.slice(0, 6)}...`);
  }

  log(`Starting screenpipe: ${bin}`);

  screenpipeProc = spawn(bin, ['record', '--disable-audio'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: {
      ...process.env,
      PATH: `${process.resourcesPath}:${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`,
    },
  });

  const handleScreenpipeOutput = (data: Buffer) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      log(`[screenpipe] ${line}`);
    }
  };

  screenpipeProc.stdout?.on('data', handleScreenpipeOutput);
  screenpipeProc.stderr?.on('data', handleScreenpipeOutput);

  screenpipeProc.on('error', (err) => {
    log(`screenpipe failed to start: ${err.message}`);
    screenpipeProc = null;
  });

  screenpipeProc.on('exit', (code, signal) => {
    log(`screenpipe exited (code=${code}, signal=${signal})`);
    screenpipeProc = null;
  });
}

function stopScreenpipe(): void {
  if (!screenpipeProc) return;
  log('Stopping screenpipe');
  try {
    screenpipeProc.kill('SIGTERM');
  } catch {
    // already dead
  }
  screenpipeProc = null;
}

// --- Tray ---

function createTrayIcon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(
    path.join(APP_ROOT, 'assets', 'tray-icon.png'),
  );
  return img.resize({ width: 18, height: 18 });
}

function createTray(): void {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Tomato');
  updateTrayMenu();

  tray.on('click', () => {
    if (sessionState.active) {
      if (timerWin) {
        timerWin.isVisible() ? timerWin.hide() : timerWin.show();
      } else {
        showTimerWindow();
      }
    } else {
      showStartWindow();
    }
  });
}

function updateTrayMenu(): void {
  if (!tray) return;

  const template: Electron.MenuItemConstructorOptions[] = [];

  if (sessionState.active) {
    const mins = Math.floor(sessionState.remainingSec / 60);
    const secs = sessionState.remainingSec % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    template.push(
      { label: 'Focus session', enabled: false },
      { label: `${timeStr} remaining`, enabled: false },
      { type: 'separator' },
      {
        label: sessionState.paused ? 'Resume session' : 'Pause session',
        click: () => togglePause(),
      },
      { label: 'End session', click: () => endSession() },
      { type: 'separator' },
      { label: 'Open Session Timer', click: () => showTimerWindow() },
    );
  } else {
    template.push({
      label: 'Start a session...',
      click: () => showStartWindow(),
    });
  }

  if (VITE_DEV_SERVER_URL) {
    template.push(
      { type: 'separator' },
      { label: 'Debug Dashboard', click: () => showDebugWindow() },
    );
  }

  template.push(
    { type: 'separator' },
    { label: 'Settings...', click: () => showSettingsWindow() },
  );

  template.push(
    { type: 'separator' },
    { label: 'Quit Tomato', role: 'quit' },
  );

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

// --- Windows ---

function showPermissionsWindow(): void {
  showOnboardingWindow('/permissions');
}

function showApiKeyWindow(): void {
  showOnboardingWindow('/api-key');
}

function showSettingsWindow(): void {
  if (startWin) {
    startWin.show();
    startWin.focus();
    startWin.webContents.send('show-settings');
  } else {
    showOnboardingWindow('/start');
    const win = startWin as BrowserWindow | null;
    win?.webContents.once('did-finish-load', () => {
      win?.webContents.send('show-settings');
    });
  }
}

function showOnboardingWindow(hash: string): void {
  if (startWin) {
    loadRendererPage(startWin, hash);
    startWin.setSize(760, 780);
    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
    startWin.setPosition(Math.round((screenWidth - 760) / 2), 60);
    startWin.show();
    startWin.focus();
    return;
  }

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 760;
  const winHeight = 780;

  startWin = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.round((screenWidth - winWidth) / 2),
    y: 60,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: true,
    vibrancy: 'under-window',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  loadRendererPage(startWin, hash);
  startWin.on('closed', () => {
    startWin = null;
  });
}

function showStartWindow(): void {
  if (startWin) {
    startWin.show();
    startWin.focus();
    return;
  }

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 520;
  const winHeight = 860;

  startWin = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: screenWidth - winWidth - 40,
    y: 40,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: true,
    vibrancy: 'under-window',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  loadRendererPage(startWin, '/start');
  startWin.on('closed', () => {
    startWin = null;
  });
}

function showTimerWindow(): void {
  if (timerWin) {
    timerWin.show();
    timerWin.focus();
    return;
  }

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  timerWin = new BrowserWindow({
    width: 360,
    height: 220,
    x: screenWidth - 380,
    y: 40,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  loadRendererPage(timerWin, '/hud');
  timerWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  timerWin.on('closed', () => {
    timerWin = null;
  });
}

let debugWin: BrowserWindow | null = null;

function showDebugWindow(): void {
  if (debugWin) {
    debugWin.show();
    debugWin.focus();
    return;
  }

  debugWin = new BrowserWindow({
    width: 700,
    height: 800,
    title: 'Debug Dashboard',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  loadRendererPage(debugWin, '/debug');
  debugWin.on('close', (e) => {
    e.preventDefault();
    debugWin?.hide();
  });
}

function showNudgeWindow(): void {
  if (nudgeWin) {
    nudgeWin.show();
    return;
  }

  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  nudgeWin = new BrowserWindow({
    width: 340,
    height: 180,
    x: Math.round((screenWidth - 340) / 2),
    y: Math.round(screenHeight * 0.55),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  loadRendererPage(nudgeWin, '/nudge');
  nudgeWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  nudgeWin.on('closed', () => {
    nudgeWin = null;
  });
}

// --- Session logic ---

let timerInterval: ReturnType<typeof setInterval> | null = null;

function startSession(intention: string, durationMin: number): void {
  sessionStartedAt = new Date().toISOString();
  sessionState = {
    active: true,
    intention,
    durationMin,
    remainingSec: durationMin * 60,
    paused: false,
  };

  if (startWin) {
    startWin.close();
    startWin = null;
  }

  showTimerWindow();
  sendTimerState();
  updateTrayMenu();

  startScreenpipe();

  const dbPath = path.join(os.homedir(), '.screenpipe', 'db.sqlite');

  const apiKey = keychain?.getApiKey() ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log('No API key available — AI features disabled for this session');
  }
  const selectedModel = keychain?.getSelectedModel() ?? DEFAULT_MODEL;
  const llm = new AnthropicLlmClient(
    new Anthropic({ apiKey: apiKey || undefined, dangerouslyAllowBrowser: true }),
    selectedModel,
  );
  const batchMs = process.env.TOMATO_BATCH_MS ? parseInt(process.env.TOMATO_BATCH_MS) : undefined;

  function tryOpenDbAndStart(): void {
    try {
      db = new SqliteScreenpipeDb(new Database(dbPath, { readonly: true }));
      log(`Opened screenpipe DB: ${dbPath}`);
    } catch (err) {
      log(`Waiting for screenpipe DB: ${(err as Error).message}`);
      setTimeout(tryOpenDbAndStart, 3000);
      return;
    }

    focusTracker = new FocusTracker({ db, llm, batchIntervalMs: batchMs });

    focusTracker.onActivity = (activity) => {
      if (timerWin) {
        timerWin.webContents.send('activity-update', activity);
      }
    };

    focusTracker.onDrift = (data) => {
      log(`Drift detected: ${data.reason} (confidence: ${data.confidence}, classification: ${data.level2Classification})`);
      showNudgeWindow();
      if (timerWin) {
        timerWin.webContents.send('drift-detected', data);
      }
    };

    focusTracker.onApiError = (data) => {
      log(`API error: type=${data.type}, message=${data.message}`);
      if (timerWin) {
        timerWin.webContents.send('api-error', data);
      }
      if (data.type === 'model_deprecated' && keychain) {
        keychain.setSelectedModel(DEFAULT_MODEL);
      }
    };

    focusTracker.onTimelineUpdate = (entries) => {
      if (timerWin) {
        timerWin.webContents.send('timeline-update', entries);
      }
      if (debugWin) {
        debugWin.webContents.send('timeline-update', entries);
      }
    };

    focusTracker.start(intention, durationMin);
  }

  tryOpenDbAndStart();

  timerInterval = setInterval(() => {
    if (sessionState.paused) return;

    sessionState.remainingSec--;

    if (sessionState.remainingSec <= 0) {
      endSession();
      return;
    }

    sendTimerState();

    if (sessionState.remainingSec % 30 === 0) {
      updateTrayMenu();
    }
  }, 1000);
}

function togglePause(): void {
  sessionState.paused = !sessionState.paused;
  if (focusTracker) {
    sessionState.paused ? focusTracker.pause() : focusTracker.resume();
  }
  sendTimerState();
  updateTrayMenu();
}

async function endSession(): Promise<void> {
  sessionState.active = false;
  sessionState.paused = false;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const startedAt = sessionStartedAt ?? new Date().toISOString();
  const actualElapsedSec = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
  const actualDurationMin = Math.max(1, Math.round(actualElapsedSec / 60));

  if (focusTracker) {
    if (actualElapsedSec >= 15) {
      const activities = focusTracker.getActivities();

      let summary: string | undefined;
      let focusScore: number | undefined;

      if (activities.length > 0) {
        const sessionSummary = await focusTracker.summarizeSession(actualDurationMin);
        summary = sessionSummary?.summary;
        focusScore = sessionSummary?.focusScore;
      } else {
        summary = 'No activity was tracked during this session.';
        focusScore = 0;
      }

      saveSession({
        intention: sessionState.intention,
        durationMin: sessionState.durationMin,
        startedAt,
        activities,
        summary,
        focusScore,
      });
    }
    focusTracker.stop();
    focusTracker = null;
  }

  if (db) {
    db.close();
    db = null;
  }

  stopScreenpipe();

  updateTrayMenu();

  if (timerWin) {
    timerWin.close();
    timerWin = null;
  }

  if (nudgeWin) {
    nudgeWin.close();
    nudgeWin = null;
  }

  showStartWindow();
}

function sendTimerState(): void {
  if (timerWin) {
    timerWin.webContents.send('session-state', {
      ...sessionState,
      activities: focusTracker ? focusTracker.getActivities() : [],
    });
  }
}

// --- IPC handlers ---

ipcMain.on('start-session', (_event, { intention, durationMin }: { intention: string; durationMin: number }) => {
  startSession(intention, durationMin);
});

ipcMain.on('toggle-pause', () => {
  togglePause();
});

ipcMain.on('end-session', () => {
  endSession();
});

ipcMain.on('timer-resize', (_event, { expanded }: { expanded: boolean }) => {
  if (!timerWin) return;
  const [x, y] = timerWin.getPosition();
  timerWin.setSize(360, expanded ? 800 : 220);
  timerWin.setPosition(x, y);
});

ipcMain.on('timer-ready', () => {
  sendTimerState();
});

ipcMain.on('close-start', () => {
  if (startWin) startWin.close();
});

ipcMain.on('nudge-refocus', () => {
  if (nudgeWin) {
    nudgeWin.close();
    nudgeWin = null;
  }
});

ipcMain.on('nudge-pause', () => {
  togglePause();
  if (nudgeWin) {
    nudgeWin.close();
    nudgeWin = null;
  }
});

ipcMain.handle('get-session-state', () => ({
  ...sessionState,
  activities: focusTracker ? focusTracker.getActivities() : [],
}));

ipcMain.handle('get-recent-sessions', () => getRecentSessions(5));

ipcMain.handle('get-screen-permission', () => {
  return systemPreferences.getMediaAccessStatus('screen') === 'granted';
});

ipcMain.handle('get-accessibility-permission', () => {
  return systemPreferences.isTrustedAccessibilityClient(false);
});

ipcMain.on('open-screen-permission-settings', () => {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
});

ipcMain.on('open-accessibility-permission-settings', () => {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
});

ipcMain.on('permissions-complete', () => {
  showApiKeyWindow();
});

ipcMain.handle('validate-api-key', async (_event, key: string) => {
  const redacted = key.length > 4 ? `…${key.slice(-4)}` : '***';
  log(`Validating API key ${redacted}`);
  try {
    const result = await validateApiKey(key);
    log(`Validation result: valid=${result.valid}${!result.valid ? `, error=${(result as any).error}` : ''}`);
    return result;
  } catch (err) {
    log(`Validation threw: ${(err as Error).message}`);
    return { valid: false, error: (err as Error).message, retryable: true };
  }
});

ipcMain.handle('save-api-key', async (_event, key: string, selectedModel: string) => {
  if (!keychain) return { success: false, error: "Keychain not initialized" };
  try {
    keychain.saveApiKey(key.trim());
    keychain.setSelectedModel(selectedModel);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle('get-onboarding-state', () => {
  if (!keychain) return { hasApiKey: false, selectedModel: null };
  return {
    hasApiKey: keychain.getApiKey() !== null,
    selectedModel: keychain.getSelectedModel(),
  };
});

ipcMain.on('api-key-complete', () => {
  if (startWin) {
    startWin.close();
    startWin = null;
  }
  showStartWindow();
});

ipcMain.handle('fetch-models', async () => {
  const apiKey = keychain?.getApiKey();
  if (!apiKey) return { models: [], error: 'No API key saved' };

  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return { models: [], error: `Anthropic returned ${response.status}` };
    }

    const body = await response.json() as { data?: { id: string }[] };
    const modelIds = (body.data ?? []).map((m) => m.id);
    const models = modelIds.map((id) => {
      const pricing = getModelPricing(id);
      return {
        id,
        priceTier: getPriceTier(id),
        inputPer1M: pricing?.inputPer1M ?? null,
        outputPer1M: pricing?.outputPer1M ?? null,
      };
    });
    return { models };
  } catch {
    return { models: [], error: "Couldn't reach Anthropic — check your connection." };
  }
});

ipcMain.handle('get-settings-state', () => {
  if (!keychain) return { hasApiKey: false, maskedKey: null, selectedModel: null };
  const rawKey = keychain.getApiKey();
  return {
    hasApiKey: rawKey !== null,
    maskedKey: rawKey ? `sk-ant-•••••${rawKey.slice(-4)}` : null,
    selectedModel: keychain.getSelectedModel(),
  };
});

ipcMain.on('update-model', (_event, { modelId }: { modelId: string }) => {
  keychain?.setSelectedModel(modelId);
  log(`Model updated to ${modelId}`);
});

ipcMain.on('quit-app', () => {
  app.quit();
});

ipcMain.on('open-settings', () => {
  showSettingsWindow();
});

ipcMain.on('close-settings', () => {
  if (startWin) {
    startWin.webContents.send('hide-settings');
  }
});

ipcMain.handle('get-debug-pipeline-state', () => {
  return focusTracker?.getDebugState() ?? null;
});

ipcMain.handle('capture', () => {
  if (!db) return { error: 'No active session / DB not connected' };
  try {
    const frames = db.getFrames(
      new Date(Date.now() - 30_000).toISOString(),
      new Date().toISOString(),
      3,
    );
    return {
      frames: frames.map((f) => ({
        app: f.app_name,
        window: f.window_name,
        text: '',
        timestamp: f.timestamp,
        focused: f.focused ?? false,
      })),
    };
  } catch (err) {
    return { error: `DB query failed: ${(err as Error).message}` };
  }
});

// --- App lifecycle ---

app.setPath('userData', path.join(app.getPath('appData'), 'tomato'));

app.whenReady().then(async () => {
  app.dock?.setIcon(path.join(APP_ROOT, 'assets', 'app-icon.png'));

  keychain = new ElectronKeychainStore(app.getPath('userData'));

  const screenOk = systemPreferences.getMediaAccessStatus('screen') === 'granted';
  const a11yOk = systemPreferences.isTrustedAccessibilityClient(false);
  log(`Permissions check: screen=${screenOk}, accessibility=${a11yOk}`);

  // Request permissions that aren't granted yet.
  if (!screenOk) {
    // CGRequestScreenCaptureAccess registers the app in Screen Recording settings
    const helper = path.join(process.resourcesPath, 'request-screen-access');
    if (fs.existsSync(helper)) {
      try { execFileSync(helper, { timeout: 5000 }); } catch {}
    } else {
      // Fallback for dev mode
      const localHelper = path.join(APP_ROOT, 'bin', 'request-screen-access');
      if (fs.existsSync(localHelper)) {
        try { execFileSync(localHelper, { timeout: 5000 }); } catch {}
      } else {
        await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => {});
      }
    }
  }
  if (!a11yOk) {
    systemPreferences.isTrustedAccessibilityClient(true);
  }

  createTray();

  const hasApiKey = keychain.getApiKey() !== null;

  if (!screenOk || !a11yOk) {
    log('Routing to permissions window');
    showPermissionsWindow();
  } else if (!hasApiKey) {
    log('Routing to API key onboarding');
    showApiKeyWindow();
  } else {
    log('Routing to start window');
    showStartWindow();
  }
});

function cleanup(): void {
  stopScreenpipe();
  if (focusTracker) focusTracker.stop();
  if (debugWin) {
    debugWin.removeAllListeners('close');
    debugWin.close();
    debugWin = null;
  }
  if (db) {
    db.close();
    db = null;
  }
}

app.on('before-quit', cleanup);
app.on('window-all-closed', () => {
  // tray app — don't quit on window close
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit();
});
process.on('SIGINT', () => {
  cleanup();
  process.exit();
});
process.on('exit', cleanup);
