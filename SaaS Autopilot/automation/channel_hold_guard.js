'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '..');
const HOLD_FILE = path.join(WORKSPACE_DIR, 'metadata', 'channel_activity_hold.json');

function readHold() {
  if (!fs.existsSync(HOLD_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(HOLD_FILE, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return {
      channel: 'saas_autopilot',
      hold_active: true,
      reason: 'Hold file exists but could not be parsed.'
    };
  }
}

function assertChannelNotOnHold(activityName) {
  const hold = readHold();
  if (!hold || hold.hold_active === false) return;

  const label = activityName || 'SaaS Autopilot activity';
  console.error(`CHANNEL HOLD ACTIVE: ${label} blocked.`);
  console.error(`Reason: ${hold.reason || 'Channel activity is paused.'}`);
  console.error(`Hold file: ${HOLD_FILE}`);
  process.exit(2);
}

module.exports = {
  HOLD_FILE,
  readHold,
  assertChannelNotOnHold
};
