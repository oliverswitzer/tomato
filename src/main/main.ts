import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  screen,
  ipcMain,
  nativeImage,
} from 'electron';
import { spawn, execFileSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { FocusTracker } from './focus-tracker';
import { saveSession, getRecentSessions } from './session-store';
import type { SessionState, KeystrokeChunk } from '../shared/ipc';

const APP_ROOT = path.join(__dirname, '..', '..');
const LOG_FILE = path.join(APP_ROOT, 'tomato.log');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] [main] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

let tray: Tray | null = null;
let startWin: BrowserWindow | null = null;
let hudWin: BrowserWindow | null = null;
let nudgeWin: BrowserWindow | null = null;
let screenpipeProc: ChildProcess | null = null;
let keylistenerProc: ChildProcess | null = null;
let focusTracker: FocusTracker | null = null;

let sessionState: SessionState = {
  active: false,
  intention: '',
  durationMin: 25,
  remainingSec: 0,
  paused: false,
};

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

  screenpipeProc = spawn(bin, ['record'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  screenpipeProc.stdout?.on('data', (data: Buffer) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      log(`[screenpipe] ${line}`);
    }
  });

  screenpipeProc.stderr?.on('data', (data: Buffer) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      log(`[screenpipe] ${line}`);
    }
  });

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

// --- Keylistener ---

function startKeylistener(): void {
  const bin = path.join(APP_ROOT, 'keylistener');
  if (!fs.existsSync(bin)) {
    log('Keylistener binary not found — skipping keystroke capture');
    return;
  }

  log(`Starting keylistener: ${bin}`);

  keylistenerProc = spawn(bin, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  keylistenerProc.stdout?.on('data', (data: Buffer) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      try {
        const chunk = JSON.parse(line) as KeystrokeChunk;
        if (chunk.type === 'keystroke_chunk' && focusTracker) {
          focusTracker.addKeystrokeChunk(chunk);
        }
      } catch {
        log(`[keylistener] ${line}`);
      }
    }
  });

  keylistenerProc.stderr?.on('data', (data: Buffer) => {
    log(`[keylistener] ${data.toString().trim()}`);
  });

  keylistenerProc.on('error', (err) => {
    log(`keylistener failed to start: ${err.message}`);
    keylistenerProc = null;
  });

  keylistenerProc.on('exit', (code) => {
    log(`keylistener exited (code=${code})`);
    keylistenerProc = null;
  });
}

function stopKeylistener(): void {
  if (!keylistenerProc) return;
  log('Stopping keylistener');
  try {
    keylistenerProc.kill('SIGTERM');
  } catch {
    // already dead
  }
  keylistenerProc = null;
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
      if (hudWin) {
        hudWin.isVisible() ? hudWin.hide() : hudWin.show();
      } else {
        showHudWindow();
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
      { label: 'Open session HUD', click: () => showHudWindow() },
    );
  } else {
    template.push({
      label: 'Start a session...',
      click: () => showStartWindow(),
    });
  }

  template.push(
    { type: 'separator' },
    { label: 'Quit Tomato', role: 'quit' },
  );

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

// --- Windows ---

function showStartWindow(): void {
  if (startWin) {
    startWin.show();
    startWin.focus();
    return;
  }

  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 520;
  const winHeight = 720;

  startWin = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.round((screenWidth - winWidth) / 2),
    y: Math.round((screenHeight - winHeight) / 2),
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

function showHudWindow(): void {
  if (hudWin) {
    hudWin.show();
    hudWin.focus();
    return;
  }

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  hudWin = new BrowserWindow({
    width: 360,
    height: 180,
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

  loadRendererPage(hudWin, '/hud');
  hudWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hudWin.on('closed', () => {
    hudWin = null;
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

  showHudWindow();
  sendHudState();
  updateTrayMenu();

  startScreenpipe();
  startKeylistener();

  focusTracker = new FocusTracker();
  focusTracker.apiKey = process.env.SCREENPIPE_API_KEY || '';

  focusTracker.onActivity = (activity) => {
    if (hudWin) {
      hudWin.webContents.send('activity-update', activity);
    }
  };

  focusTracker.onDrift = (reason) => {
    log(`Drift detected: ${reason}`);
    showNudgeWindow();
    if (hudWin) {
      hudWin.webContents.send('drift-detected', { reason });
    }
  };

  focusTracker.start(intention, durationMin);

  timerInterval = setInterval(() => {
    if (sessionState.paused) return;

    sessionState.remainingSec--;

    if (sessionState.remainingSec <= 0) {
      endSession();
      return;
    }

    sendHudState();

    if (sessionState.remainingSec % 30 === 0) {
      updateTrayMenu();
    }
  }, 1000);
}

function togglePause(): void {
  sessionState.paused = !sessionState.paused;
  sendHudState();
  updateTrayMenu();
}

function endSession(): void {
  sessionState.active = false;
  sessionState.paused = false;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (focusTracker) {
    saveSession({
      intention: sessionState.intention,
      durationMin: sessionState.durationMin,
      activities: focusTracker.getActivities(),
    });
    focusTracker.stop();
    focusTracker = null;
  }

  stopScreenpipe();
  stopKeylistener();

  updateTrayMenu();

  if (hudWin) {
    hudWin.close();
    hudWin = null;
  }

  if (nudgeWin) {
    nudgeWin.close();
    nudgeWin = null;
  }

  showStartWindow();
}

function sendHudState(): void {
  if (hudWin) {
    hudWin.webContents.send('session-state', {
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

ipcMain.on('hud-resize', (_event, { expanded }: { expanded: boolean }) => {
  if (!hudWin) return;
  const [x, y] = hudWin.getPosition();
  hudWin.setSize(expanded ? 400 : 360, expanded ? 560 : 180);
  hudWin.setPosition(x, y);
});

ipcMain.on('hud-ready', () => {
  sendHudState();
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

ipcMain.handle('capture', async () => {
  const SCREENPIPE_API = 'http://localhost:3030';
  const params = new URLSearchParams({
    q: '',
    content_type: 'ocr',
    limit: '3',
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = process.env.SCREENPIPE_API_KEY;
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  try {
    const res = await fetch(`${SCREENPIPE_API}/search?${params}`, { headers });
    if (!res.ok) {
      return { error: `Screenpipe API returned ${res.status}: ${res.statusText}` };
    }
    const data = await res.json() as {
      data?: Array<{
        content: {
          app_name: string;
          window_name: string;
          text: string;
          timestamp: string;
          focused: boolean;
        };
      }>;
    };

    if (!data.data || data.data.length === 0) {
      return { error: 'No recent captures found. Is screenpipe running?' };
    }

    const frames = data.data.map((d) => ({
      app: d.content.app_name,
      window: d.content.window_name,
      text: d.content.text,
      timestamp: d.content.timestamp,
      focused: d.content.focused,
    }));

    return { frames };
  } catch (err) {
    return { error: `Failed to reach screenpipe: ${(err as Error).message}` };
  }
});

// --- App lifecycle ---

app.whenReady().then(() => {
  app.dock?.setIcon(path.join(APP_ROOT, 'assets', 'app-icon.png'));
  createTray();
  showStartWindow();
});

function cleanup(): void {
  stopScreenpipe();
  stopKeylistener();
  if (focusTracker) focusTracker.stop();
}

app.on('before-quit', cleanup);
app.on('window-all-closed', () => {
  // Prevent app from quitting when all windows are closed (tray app)
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
