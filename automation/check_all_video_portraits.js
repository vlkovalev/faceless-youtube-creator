const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SAINTS_ROOT = path.join(REPO_ROOT, 'The Saints');

for (let id = 13; id <= 20; id++) {
  const realDir = path.join(SAINTS_ROOT, 'assets', `saints_video_${id}_assets`, 'real_sources');
  if (fs.existsSync(realDir)) {
    console.log(`Video ${id}:`, fs.readdirSync(realDir));
  } else {
    console.log(`Video ${id}: real_sources directory NOT FOUND at ${realDir}`);
  }
}
