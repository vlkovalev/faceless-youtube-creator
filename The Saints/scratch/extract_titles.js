const fs = require('fs');
const path = require('path');

const contentFile = 'C:\\Users\\heliu\\.gemini\\antigravity\\brain\\5f15b88e-32d9-45bb-b6ef-7f4d0233ce96\\.system_generated\\steps\\580\\content.md';
if (!fs.existsSync(contentFile)) {
  console.error('Content file not found at: ' + contentFile);
  process.exit(1);
}

const content = fs.readFileSync(contentFile, 'utf8');

// Let's search for blog post headers in LiveJournal template
// Usually they are inside <h2> or <h3> entries, let's extract them.
const regex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
let match;
const titles = new Set();

while ((match = regex.exec(content)) !== null) {
  const text = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (text.length > 5 && text.length < 150 && !text.includes('LiveJournal') && !text.includes('Log in')) {
    titles.add(text);
  }
}

console.log('--- Found Header Texts in LiveJournal ---');
Array.from(titles).forEach((t, i) => console.log(`${i + 1}: ${t}`));
