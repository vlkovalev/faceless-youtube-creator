const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..');
const SAINTS_ROOT = path.join(REPO_ROOT, 'The Saints');

const videos = [13, 14, 15, 16, 17, 18, 19, 20];

for (const id of videos) {
  console.log(`\n======================================================`);
  console.log(`Rendering Video ${id}...`);
  console.log(`======================================================`);
  try {
    const cmd = `node "automation/saints_editor_agent.js" ${id}`;
    console.log(`Running: ${cmd}`);
    execSync(cmd, { cwd: SAINTS_ROOT, stdio: 'inherit' });
    console.log(`Successfully rendered Video ${id}`);
  } catch (err) {
    console.error(`Failed to render Video ${id}:`, err.message);
  }
}
