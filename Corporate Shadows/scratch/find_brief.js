const fs = require('fs');
const path = require('path');

const transcriptPath = path.join('C:', 'Users', 'heliu', '.gemini', 'antigravity', 'brain', 'ff798e98-45e1-437a-ae19-eed09595a30b', '.system_generated', 'logs', 'transcript.jsonl');

const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');

// Find all USER_INPUT steps and print their content
lines.forEach((line, index) => {
  if (!line.trim()) return;
  try {
    const obj = JSON.parse(line);
    if (obj.type === 'USER_INPUT') {
      console.log(`\n=== USER INPUT AT STEP ${obj.step_index} (Line ${index + 1}) ===`);
      console.log(obj.content);
    }
  } catch (e) {
    // ignore
  }
});
