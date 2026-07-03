const fs = require('fs');
const path = require('path');

const queuePath = path.join('c:', 'Users', 'heliu', 'Desktop', 'WebSItes', 'faceless-youtube-creator-clean', 'The Saints', 'metadata', 'queue.json');

if (!fs.existsSync(queuePath)) {
  console.log('Saints queue.json not found');
  process.exit(0);
}

const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));

queue.forEach((entry, i) => {
  console.log(`[${i}] Filename: ${entry.filename} | Title: ${entry.title} | Status: ${entry.status}`);
});
