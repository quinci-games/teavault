const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'TeaVault',
  description: 'TeaVault — tea inventory Express server',
  script: path.join(__dirname, 'service-entry.cjs'),
  workingDirectory: path.join(__dirname, '..'),
  wait: 2,
  grow: 0.5,
  maxRestarts: 3,
});

svc.on('install', () => { console.log('Service installed. Starting...'); svc.start(); });
svc.on('alreadyinstalled', () => console.log('Service is already installed.'));
svc.on('error', (err) => console.error('Service error:', err));

svc.install();
