'use strict';

/**
 * Compatibility wrapper.
 *
 * master_autopilot.js now delegates to the single control-tower workflow in
 * full_cycle_controller.js so every run goes through the same issue handling,
 * retries, status sync, delay checks, and reporting path.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONTROLLER = path.join(__dirname, 'full_cycle_controller.js');
const passthroughArgs = process.argv.slice(2);

const result = spawnSync(process.execPath, [CONTROLLER, ...passthroughArgs], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
  env: { ...process.env }
});

process.exitCode = result.status || 0;
