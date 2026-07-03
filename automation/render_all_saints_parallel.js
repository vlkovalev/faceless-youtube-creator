const { exec } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SAINTS_ROOT = path.join(REPO_ROOT, 'The Saints');

const videos = [13, 14, 15, 16, 17, 18, 19, 20];
const CONCURRENCY_LIMIT = 4;

function renderVideo(id) {
  return new Promise((resolve, reject) => {
    console.log(`[START] Video ${id} rendering started...`);
    const cmd = `node "automation/saints_editor_agent.js" ${id}`;
    const child = exec(cmd, { cwd: SAINTS_ROOT });

    child.stdout.on('data', (data) => {
      // Print output prefixing with Video ID to distinguish logs
      process.stdout.write(`[Video ${id}] ${data}`);
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(`[Video ${id} ERROR] ${data}`);
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[SUCCESS] Video ${id} rendered successfully!`);
        resolve();
      } else {
        console.error(`[FAILED] Video ${id} exited with code ${code}`);
        reject(new Error(`Exit code ${code}`));
      }
    });
  });
}

async function run() {
  const queue = [...videos];
  const active = [];

  async function next() {
    if (queue.length === 0) return;
    const id = queue.shift();
    const promise = renderVideo(id).catch(err => {
      console.error(`Error rendering Video ${id}:`, err.message);
    });
    active.push(promise);
    await promise;
    active.splice(active.indexOf(promise), 1);
    await next();
  }

  // Start initial batch of processes
  const initialPromises = [];
  for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, queue.length); i++) {
    initialPromises.push(next());
  }

  await Promise.all(initialPromises);
  console.log("\n=============================================");
  console.log("All video rendering completed!");
  console.log("=============================================\n");
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
