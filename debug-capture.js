const { app, BrowserWindow, ipcMain } = require('electron');
const { execFileSync } = require('child_process');
const path = require('path');

const SCREENPIPE_API = 'http://localhost:3030';
let apiKey = '';

function resolveScreenpipeBin() {
  if (process.env.SCREENPIPE_BIN) return process.env.SCREENPIPE_BIN;
  const platform = `${process.platform}-${process.arch}`;
  const pkgMap = {
    'darwin-arm64': '@screenpipe/cli-darwin-arm64',
    'darwin-x64': '@screenpipe/cli-darwin-x64',
  };
  const pkg = pkgMap[platform];
  if (!pkg) return null;
  try {
    const pkgJson = require.resolve(`${pkg}/package.json`);
    return path.join(path.dirname(pkgJson), 'bin', 'screenpipe');
  } catch {
    return null;
  }
}

try {
  const bin = resolveScreenpipeBin();
  if (bin) {
    apiKey = execFileSync(bin, ['auth', 'token'], { encoding: 'utf8' }).trim();
    console.log(`Resolved screenpipe API key: ${apiKey.slice(0, 6)}...`);
  }
} catch (err) {
  console.log(`Could not resolve screenpipe key: ${err.message}`);
}

if (process.env.SCREENPIPE_API_KEY) apiKey = process.env.SCREENPIPE_API_KEY;

ipcMain.handle('capture', async () => {
  const params = new URLSearchParams({
    q: '',
    content_type: 'ocr',
    limit: '3',
  });

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  try {
    const res = await fetch(`${SCREENPIPE_API}/search?${params}`, { headers });
    if (!res.ok) {
      return { error: `Screenpipe API returned ${res.status}: ${res.statusText}` };
    }
    const data = await res.json();

    if (!data.data || data.data.length === 0) {
      return { error: 'No recent captures found. Is screenpipe running?' };
    }

    const frames = data.data.map(d => ({
      app: d.content.app_name,
      window: d.content.window_name,
      text: d.content.text,
      timestamp: d.content.timestamp,
      focused: d.content.focused,
    }));

    return { frames };
  } catch (err) {
    return { error: `Failed to reach screenpipe: ${err.message}` };
  }
});

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 700,
    height: 800,
    title: 'Screenpipe Capture Debugger',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile(path.join(__dirname, 'debug-capture.html'));
});

app.on('window-all-closed', () => app.quit());
