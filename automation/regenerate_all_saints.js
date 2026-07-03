const { execSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SAINTS_ROOT = path.join(REPO_ROOT, 'The Saints');

for (let id = 13; id <= 20; id++) {
  console.log(`\n===================================`);
  console.log(`Generating cards for Video ${id}...`);
  console.log(`===================================`);
  try {
    const output = execSync(
      `powershell -ExecutionPolicy Bypass -File automation/saints_visual_polish_agent.ps1 ${id}`,
      { cwd: SAINTS_ROOT, encoding: 'utf8' }
    );
    console.log(output);
  } catch (err) {
    console.error(`Error generating cards for Video ${id}:`, err.message);
  }
}
