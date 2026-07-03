const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const CS_AUTO_DIR = path.join(WORKSPACE_DIR, 'Corporate Shadows', 'automation');

const FILES_TO_FIX = [
  'channel_director_agent.js',
  'publisher_agent.js',
  'seedance_creator_agent.js',
  'auto_allow_rescheduler.js',
  'reschedule_to_20_days.js'
];

function fixFile(fileName) {
  const filePath = path.join(CS_AUTO_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ File not found: ${fileName}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Replace hardcoded AGY_NODE path with process.execPath
  content = content.replace(
    /const AGY_NODE = 'C:\\\\Users\\\\heliu\\\\AppData\\\\Roaming\\\\Antigravity\\\\bin\\\\agy-node\.cmd';/g,
    'const AGY_NODE = process.execPath;'
  );

  // 2. Replace the dynamic fallback nodeBin
  content = content.replace(
    /const nodeBin = fs\.existsSync\(AGY_NODE\) \? AGY_NODE : 'node';/g,
    'const nodeBin = process.execPath;'
  );

  // 3. Replace shell: true with shell: false
  content = content.replace(/shell: true/g, 'shell: false');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Patched: ${fileName} to use process.execPath and shell: false`);
}

function main() {
  console.log('⚡ Starting command window popup suppression patches...\n');
  FILES_TO_FIX.forEach(fixFile);
  console.log('\n🎉 Suppression patches completed successfully!');
}

main();
