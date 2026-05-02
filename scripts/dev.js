const { spawn, execSync } = require('child_process');
const path = require('path');
const net = require('net');

const ROOT = path.join(__dirname, '..');
const viteBin = path.join(ROOT, 'node_modules', '.bin', 'vite');
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function main() {
  console.log('Building main process...');
  execSync('npx tsc -p tsconfig.node.json', { cwd: ROOT, stdio: 'inherit' });
  console.log('Main process built.\n');

  const port = await findFreePort();
  console.log(`Starting Vite dev server on port ${port}...`);
  const vite = spawn(viteBin, ['--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: 'pipe',
  });

  let electronStarted = false;
  const viteUrl = `http://localhost:${port}`;

  vite.stdout.on('data', (data) => {
    process.stdout.write(data);
    if (!electronStarted && data.toString().includes('Local:')) {
      electronStarted = true;
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
}

main();
