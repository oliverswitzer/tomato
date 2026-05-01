const { spawn, execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const viteBin = path.join(ROOT, 'node_modules', '.bin', 'vite');
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');

console.log('Building main process...');
execSync('npx tsc -p tsconfig.node.json', { cwd: ROOT, stdio: 'inherit' });
console.log('Main process built.\n');

console.log('Starting Vite dev server...');
const vite = spawn(viteBin, ['--port', '5173'], {
  cwd: ROOT,
  stdio: 'pipe',
});

let electronStarted = false;

vite.stdout.on('data', (data) => {
  process.stdout.write(data);
  const output = data.toString();
  if (!electronStarted && output.includes('Local:')) {
    electronStarted = true;
    const stripped = output.replace(/\x1b\[[0-9;]*m/g, '');
    const match = stripped.match(/Local:\s+(http:\/\/localhost:\d+)/);
    const viteUrl = match ? match[1] : 'http://localhost:5173';
    console.log(`\nStarting Electron (Vite at ${viteUrl})...`);
    const electron = spawn(electronBin, ['dist/main/main.js'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, VITE_DEV_SERVER_URL: viteUrl },
    });

    const logPath = path.join(
      process.env.HOME || process.env.USERPROFILE || '.',
      'Library', 'Application Support', 'tomato', 'tomato.log'
    );
    console.log(`\nTailing ${logPath}...\n`);
    const tail = spawn('tail', ['-f', logPath], { stdio: 'inherit' });

    electron.on('close', () => {
      tail.kill();
      vite.kill();
      process.exit();
    });
  }
});

vite.stderr.on('data', (data) => process.stderr.write(data));

vite.on('close', (code) => {
  if (code !== null && code !== 0) {
    console.error(`Vite exited with code ${code}`);
    process.exit(code);
  }
});
