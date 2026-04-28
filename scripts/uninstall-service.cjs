const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'TeaVault',
  script: path.join(__dirname, 'service-entry.cjs'),
});

svc.on('uninstall', () => console.log('Service uninstalled.'));
svc.uninstall();
