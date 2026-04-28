const { spawn } = require('child_process');
const path = require('path');

const serverDir = path.join(__dirname, '..', 'server');
const child = spawn('node', ['dist/index.js'], {
  cwd: serverDir,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});

child.on('exit', (code) => process.exit(code ?? 1));
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
