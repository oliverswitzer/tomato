const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } = require('electron');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { FocusTracker } = require('./focus-tracker');
const { saveSession, getRecentSessions } = require('./session-store');

const LOG_FILE = path.join(__dirname, 'tomato.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] [main] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

let tray = null;
let startWin = null;
let hudWin = null;
let nudgeWin = null;
let screenpipeProc = null;
let keylistenerProc = null;
let focusTracker = null;

let sessionState = {
  active: false,
  intention: '',
  durationMin: 25,
  remainingSec: 0,
  paused: false,
};

// --- Screenpipe lifecycle (mirrored from screenpipe-hud) ---

function resolveScreenpipeBin() {
  if (process.env.SCREENPIPE_BIN) return process.env.SCREENPIPE_BIN;

  const platform = `${process.platform}-${process.arch}`;
  const pkgMap = {
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

function getScreenpipeApiKey(bin) {
  try {
    return execFileSync(bin, ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function startScreenpipe() {
  let bin;
  try {
    bin = resolveScreenpipeBin();
  } catch (err) {
    log(`Could not resolve screenpipe binary: ${err.message}`);
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

  screenpipeProc.stdout.on('data', (data) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      log(`[screenpipe] ${line}`);
    }
  });

  screenpipeProc.stderr.on('data', (data) => {
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

function stopScreenpipe() {
  if (!screenpipeProc) return;
  log('Stopping screenpipe');
  try { screenpipeProc.kill('SIGTERM'); } catch {}
  screenpipeProc = null;
}

// --- Keylistener (compiled Swift binary) ---

function startKeylistener() {
  const bin = path.join(__dirname, 'keylistener');
  if (!fs.existsSync(bin)) {
    log('Keylistener binary not found — skipping keystroke capture');
    return;
  }

  log(`Starting keylistener: ${bin}`);

  keylistenerProc = spawn(bin, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  keylistenerProc.stdout.on('data', (data) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      try {
        const chunk = JSON.parse(line);
        if (chunk.type === 'keystroke_chunk' && focusTracker) {
          focusTracker.addKeystrokeChunk(chunk);
        }
      } catch {
        log(`[keylistener] ${line}`);
      }
    }
  });

  keylistenerProc.stderr.on('data', (data) => {
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

function stopKeylistener() {
  if (!keylistenerProc) return;
  log('Stopping keylistener');
  try { keylistenerProc.kill('SIGTERM'); } catch {}
  keylistenerProc = null;
}

// --- Tray ---

function createTrayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
  return img.resize({ width: 18, height: 18 });
}

function createTray() {
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

function updateTrayMenu() {
  const template = [];

  if (sessionState.active) {
    const mins = Math.floor(sessionState.remainingSec / 60);
    const secs = sessionState.remainingSec % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    template.push(
      { label: `Focus session`, enabled: false },
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
    template.push(
      { label: 'Start a session...', click: () => showStartWindow() },
    );
  }

  template.push(
    { type: 'separator' },
    { label: 'Quit Tomato', role: 'quit' },
  );

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

// --- Windows ---

function showStartWindow() {
  if (startWin) {
    startWin.show();
    startWin.focus();
    return;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
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
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  startWin.loadFile(path.join(__dirname, 'start.html'));
  startWin.on('closed', () => { startWin = null; });
}

function showHudWindow() {
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
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  hudWin.loadFile(path.join(__dirname, 'hud.html'));
  hudWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hudWin.on('closed', () => { hudWin = null; });
}

function showNudgeWindow() {
  if (nudgeWin) {
    nudgeWin.show();
    return;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

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
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  nudgeWin.loadFile(path.join(__dirname, 'nudge.html'));
  nudgeWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  nudgeWin.on('closed', () => { nudgeWin = null; });
}

// --- Session logic ---

let timerInterval = null;

function startSession(intention, durationMin) {
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

  // Start screenpipe + keylistener only when a session begins
  startScreenpipe();
  startKeylistener();

  // Start focus tracking with screenpipe
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

function togglePause() {
  sessionState.paused = !sessionState.paused;
  sendHudState();
  updateTrayMenu();
}

function endSession() {
  sessionState.active = false;
  sessionState.paused = false;
  clearInterval(timerInterval);
  timerInterval = null;

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
    hudWin.webContents.send('session-ended');
  }

  if (nudgeWin) {
    nudgeWin.close();
    nudgeWin = null;
  }
}

function sendHudState() {
  if (hudWin) {
    hudWin.webContents.send('session-state', {
      ...sessionState,
      activities: focusTracker ? focusTracker.getActivities() : [],
    });
  }
}

// --- IPC handlers ---

ipcMain.on('start-session', (_event, { intention, durationMin }) => {
  startSession(intention, durationMin);
});

ipcMain.on('toggle-pause', () => {
  togglePause();
});

ipcMain.on('end-session', () => {
  endSession();
});

ipcMain.on('hud-resize', (_event, { expanded }) => {
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

// --- App lifecycle ---

app.whenReady().then(() => {
  app.dock?.setIcon(path.join(__dirname, 'assets', 'app-icon.png'));
  createTray();
  showStartWindow();
});

function cleanup() {
  stopScreenpipe();
  stopKeylistener();
  if (focusTracker) focusTracker.stop();
}

app.on('before-quit', cleanup);
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

process.on('SIGTERM', () => { cleanup(); process.exit(); });
process.on('SIGINT', () => { cleanup(); process.exit(); });
process.on('exit', cleanup);
