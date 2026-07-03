'use strict';

const { spawn } = require('child_process');

function openUrlHidden(targetUrl) {
  if (!targetUrl) return;

  if (process.platform === 'win32') {
    const child = spawn('cmd.exe', ['/c', 'start', '', targetUrl], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    return;
  }

  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(opener, [targetUrl], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

module.exports = { openUrlHidden };
