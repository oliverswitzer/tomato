const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } = require('electron');
const path = require('path');

let tray = null;
let startWin = null;
let hudWin = null;
let nudgeWin = null;

let sessionState = {
  active: false,
  intention: '',
  durationMin: 25,
  remainingSec: 0,
  paused: false,
};

function createTrayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
  return img.resize({ width: 18, height: 18 });
}

function createTray() {
  const icon = createTrayIcon('idle');
  tray = new Tray(icon);
  tray.setToolTip('Tomato');
  updateTrayMenu();

  tray.on('click', () => {
    if (sessionState.active && hudWin) {
      hudWin.isVisible() ? hudWin.hide() : hudWin.show();
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
    width: 320,
    height: 160,
    x: screenWidth - 340,
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

let timerInterval = null;

function startSession(intention, durationMin) {
  sessionState = {
    active: true,
    intention,
    durationMin,
    remainingSec: durationMin * 60,
    paused: false,
  };

  // tray icon stays the same for now

  if (startWin) {
    startWin.close();
    startWin = null;
  }

  showHudWindow();
  sendHudState();
  updateTrayMenu();

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
  // tray icon state change (future: swap icon)
  sendHudState();
  updateTrayMenu();
}

function endSession() {
  sessionState.active = false;
  sessionState.paused = false;
  clearInterval(timerInterval);
  timerInterval = null;

  // tray icon back to idle (future: swap icon)
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
    hudWin.webContents.send('session-state', { ...sessionState });
  }
}

// IPC handlers
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
  hudWin.setSize(expanded ? 400 : 320, expanded ? 560 : 160);
  hudWin.setPosition(x, y);
});

ipcMain.on('hud-ready', () => {
  sendHudState();
});

ipcMain.on('close-start', () => {
  if (startWin) startWin.close();
});

ipcMain.on('show-nudge', () => {
  showNudgeWindow();
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

ipcMain.handle('get-session-state', () => ({ ...sessionState }));

app.dock?.hide();

app.whenReady().then(() => {
  createTray();
  showStartWindow();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
