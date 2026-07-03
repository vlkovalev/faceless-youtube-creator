const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BUNDLED_PYTHON = 'C:\\Users\\heliu\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';

function findPython() {
  const candidates = [
    process.env.PYTHON_PATH,
    BUNDLED_PYTHON,
    'python',
    'py'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes('\\') && !fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.executable)'], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true
    });
    if (probe.status === 0) return candidate;
  }
  throw new Error('Python runtime not found. Set PYTHON_PATH or install Python with PIL.');
}

function main() {
  const python = findPython();
  const script = path.join(__dirname, 'thumbnail_style_agent.py');
  const result = spawnSync(python, [script, ...process.argv.slice(2)], {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true
  });
  process.exit(result.status || 0);
}

main();
