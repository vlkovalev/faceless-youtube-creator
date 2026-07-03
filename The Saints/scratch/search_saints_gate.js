const fs = require('fs');
const path = require('path');

const rootDir = 'c:\\Users\\heliu\\Desktop\\WebSItes\\faceless-youtube-creator-clean';

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === '.system_generated') continue;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDir(fullPath);
    } else if (stat.isFile() && /\.(js|py|ps1)$/i.test(file)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split(/\r?\n/);
        lines.forEach((line, i) => {
          if (line.toLowerCase().includes('gate') && !line.includes('git')) {
            console.log(`${fullPath}:${i + 1}: ${line.trim()}`);
          }
        });
      } catch (err) {
        // ignore
      }
    }
  }
}

searchDir(rootDir);
console.log('Search complete.');
