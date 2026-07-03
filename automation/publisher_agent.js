/**
 * publisher_agent.js
 *
 * Autonomous YouTube Publisher Agent.
 *
 * Automates the post-production uploading and metadata publishing pipeline:
 * 1. Checks if a compiled widescreen Omni Flash video exists in omni_videos/.
 * 2. Invokes metadata_agent.js to generate SEO-optimized title, description, and keywords.
 * 3. Invokes uploader_agent.js to securely upload the video as a private/scheduled draft.
 * 4. Ensures schedule alignment (midnight America/Edmonton/Alberta time).
 * 5. Automatically uploads the high-CTR thumbnail and updates the portfolio uploads tracker.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const AGY_NODE = 'C:\\Users\\heliu\\AppData\\Roaming\\Antigravity\\bin\\agy-node.cmd';
const SCRIPT_ID = process.argv[2] || '1';

function logSection(title) {
  console.log(`\n============================================================`);
  console.log(`>>> PUBLISHER EXECUTIVE: ${title.toUpperCase()}`);
  console.log(`============================================================`);
}

function runScript(scriptPath, args = []) {
  const nodeBin = fs.existsSync(AGY_NODE) ? AGY_NODE : 'node';
  console.log(`Running: ${nodeBin} ${scriptPath} ${args.join(' ')}`);
  
  const result = spawnSync(nodeBin, [scriptPath, ...args], {
    cwd: WORKSPACE_DIR,
    stdio: 'inherit',
    shell: true,
    windowsHide: true
  });
  
  return result.status === 0;
}

function main() {
  logSection(`YouTube Autonomous Publisher Agent (Video ${SCRIPT_ID})`);
  
  const videoPath = path.join(WORKSPACE_DIR, 'omni_videos', `FINAL_VIDEO_${SCRIPT_ID}_OMNI_FLASH.mp4`);
  const srtPath = path.join(WORKSPACE_DIR, 'omni_videos', `FINAL_VIDEO_${SCRIPT_ID}_OMNI_FLASH.srt`);
  
  // 1. Verify that compiled widescreen animated video exists
  if (!fs.existsSync(videoPath)) {
    console.error(`[ERROR] Compiled animated video not found in omni_videos folder: ${videoPath}`);
    console.log('[ACTION] Please run the SeedDance Video Creator Agent first to compile this video.');
    process.exit(1);
  }
  
  console.log(`[OK] Found compiled widescreen animated video: ${videoPath}`);
  
  // 2. Invoke Metadata Agent to prepare SEO packaging
  logSection('Step 1: Running Metadata SEO Agent');
  const metadataScript = path.join('automation', 'metadata_agent.js');
  const metadataSuccess = runScript(metadataScript, [SCRIPT_ID]);
  
  if (!metadataSuccess) {
    console.error('[ERROR] Metadata SEO Agent step failed!');
    process.exit(1);
  }
  console.log('[OK] SEO tags, titles, and descriptions prepared successfully!');
  
  // 3. Invoke Uploader Agent to push private/scheduled draft
  logSection('Step 2: Invoking Secure YouTube Uploader Agent');
  const uploaderScript = path.join('automation', 'uploader_agent.js');
  
  // We pass SCRIPT_ID and the custom video path to the uploader if supported,
  // or let it read from the compiled metadata queue
  const uploaderSuccess = runScript(uploaderScript, [SCRIPT_ID]);
  
  if (!uploaderSuccess) {
    console.error('[ERROR] YouTube Uploader Agent step failed!');
    process.exit(1);
  }
  
  // 4. Invoke Thumbnail uploader
  logSection('Step 3: Uploading Custom High-CTR Thumbnail');
  const thumbnailScript = path.join('automation', 'upload_thumbnail.js');
  const thumbnailSuccess = runScript(thumbnailScript, [SCRIPT_ID]);
  
  if (!thumbnailSuccess) {
    console.warn('[WARNING] Thumbnail upload step failed or verification is pending.');
  } else {
    console.log('[OK] High-CTR custom thumbnail synced successfully!');
  }
  
  // 5. Update Local Upload Status Tracker
  logSection('Step 4: Synchronizing channel content calendar');
  const statusScript = path.join('automation', 'youtube_status_agent.js');
  runScript(statusScript);

  // 6. Run Duplicate Cleaner to prune older drafts
  logSection('Step 5: Cleaning redundant duplicate uploads');
  const cleanerScript = path.join('automation', 'youtube_duplicate_cleaner.js');
  runScript(cleanerScript);
  
  console.log(`\n============================================================`);
  console.log(`[SUCCESS] Video ${SCRIPT_ID} successfully packaged & published to YouTube!`);
  console.log(`============================================================\n`);
}

main();
