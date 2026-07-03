const fs = require('fs');

const contentFile = 'C:\\Users\\heliu\\.gemini\\antigravity\\brain\\5f15b88e-32d9-45bb-b6ef-7f4d0233ce96\\.system_generated\\steps\\580\\content.md';
if (!fs.existsSync(contentFile)) {
  console.error('Content file not found.');
  process.exit(1);
}

const content = fs.readFileSync(contentFile, 'utf8');
const lines = content.split('\n');

console.log('Searching for "акафист" in LiveJournal...');
lines.forEach((line, index) => {
  if (/акафист/i.test(line)) {
    console.log(`Line ${index + 1}: ${line.trim().slice(0, 150)}`);
  }
});
