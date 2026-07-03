/**
 * channel_director_agent.js
 *
 * Executive Channel Director Agent.
 *
 * Fully automates and orchestrates the existing portfolio agents:
 * 1. PM Agent: Syncs dependencies, capacity, and content calendar status.
 * 2. QC Agent: Audits all Corporate Shadows video scripts for depth, hooks, and assets.
 * 3. SeedDance Video Creator: Automatically compiles widescreen animated outputs for any video script.
 *
 * Consolidates all logs, status reports, and video exports into a central Executive Channel Dashboard.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const AGY_NODE = 'C:\\Users\\heliu\\AppData\\Roaming\\Antigravity\\bin\\agy-node.cmd';
const OUT_REPORT = path.join(WORKSPACE_DIR, 'metadata', 'channel_director_status.json');

function logSection(title) {
  console.log(`\n============================================================`);
  console.log(`>>> DIRECTORY EXECUTIVE: ${title.toUpperCase()}`);
  console.log(`============================================================`);
}

function runScript(scriptPath, args = []) {
  const nodeBin = fs.existsSync(AGY_NODE) ? AGY_NODE : 'node';
  const result = spawnSync(nodeBin, [scriptPath, ...args], {
    cwd: WORKSPACE_DIR,
    stdio: 'pipe', // Capture stdout/stderr programmatically
    encoding: 'utf8',
    shell: true,
    windowsHide: true
  });
  return {
    success: result.status === 0,
    stdout: result.stdout ? result.stdout.trim() : '',
    stderr: result.stderr ? result.stderr.trim() : ''
  };
}

function main() {
  logSection('Autonomous Channel Director Agent Init');
  
  const report = {
    generated_at: new Date().toISOString(),
    status: 'ACTIVE',
    videos: {}
  };
  
  // 1. Run PM Agent to refresh schedule reports
  console.log('[INFO] Invoking Portfolio PM Agent to audit capacity and calendar...');
  const pmResult = runScript('automation/pm_agent.js');
  if (pmResult.success) {
    console.log('[OK] PM Agent successfully ran! Content calendar and HTML dashboard refreshed.');
  } else {
    console.warn('[WARNING] PM Agent encounterd an error during execution:', pmResult.stderr);
  }
  
  // 2. Loop through all 7 Corporate Shadows scripts and run QC + Render Orchestration
  for (let id = 1; id <= 7; id++) {
    console.log(`\n----------------------------------------`);
    console.log(`Processing Video ${id}...`);
    console.log(`----------------------------------------`);
    
    // A. Run QC Agent
    const qcResult = runScript('automation/qc_agent.js', [String(id)]);
    let qcStatus = 'UNKNOWN';
    let qcData = null;
    
    const reportPath = path.join(WORKSPACE_DIR, 'metadata', 'qc_reports', `video_${id}_qc_report.json`);
    if (fs.existsSync(reportPath)) {
      try {
        qcData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        qcStatus = qcData.qc_status;
      } catch (e) {
        console.error(`Failed to parse QC report for video ${id}`, e);
      }
    }
    
    console.log(`[QC Status] Video ${id} has status: ${qcStatus}`);
    
    // B. Check if video has been animated & compiled
    const animVideoPath = path.join(WORKSPACE_DIR, 'omni_videos', `FINAL_VIDEO_${id}_OMNI_FLASH.mp4`);
    const archivedVideoPath = path.join(WORKSPACE_DIR, 'videos', 'uploaded', `FINAL_VIDEO_${id}_OMNI_FLASH.mp4`);
    const animExists = fs.existsSync(animVideoPath) || fs.existsSync(archivedVideoPath);
    
    // C. Check if assets are ready for animation (we need 12 scene audios and keyframes)
    const assetsDir = path.join(WORKSPACE_DIR, 'assets', `video_${id}_assets`);
    let assetsReady = false;
    
    if (fs.existsSync(assetsDir)) {
      let keyframesCount = 0;
      let audiosCount = 0;
      for (let i = 1; i <= 12; i++) {
        if (fs.existsSync(path.join(assetsDir, `scene_${i}_image.png`))) keyframesCount++;
        if (fs.existsSync(path.join(assetsDir, `scene_${i}_audio.wav`)) || fs.existsSync(path.join(assetsDir, `scene_${String(i).padStart(2, '0')}_audio.wav`))) audiosCount++;
      }
      assetsReady = (keyframesCount >= 12 && audiosCount >= 12);
      console.log(`[Assets Check] Video ${id}: ${keyframesCount}/12 keyframes, ${audiosCount}/12 audios.`);
    }
    
    // D. Automate Render Trigger if ready but not animated yet!
    let renderTriggered = false;
    if (assetsReady && !animExists) {
      console.log(`\n[AUTOPILOT ACTION] Video ${id} is ready for animation but FINAL_VIDEO_${id}_OMNI_FLASH.mp4 is missing.`);
      console.log(`[AUTOPILOT ACTION] Automatically launching SeedDance Video Creator Agent...`);
      
      const renderResult = runScript('automation/seedance_creator_agent.js', [String(id)]);
      if (renderResult.success) {
        console.log(`[OK] Video ${id} successfully compiled and packaged by Autopilot!`);
        renderTriggered = true;
      } else {
        console.error(`[ERROR] Autopilot failed to render Video ${id}:`, renderResult.stderr);
      }
    } else if (animExists) {
      console.log(`[OK] Video ${id} already has a completed SeedDance widescreen compilation.`);
    } else {
      console.log(`[INFO] Video ${id} is still in visual design/research phase. Sourcing is needed.`);
    }
    
    report.videos[id] = {
      script_id: id,
      qc_status: qcStatus,
      assets_ready: assetsReady,
      animated_video_exists: fs.existsSync(animVideoPath),
      autopilot_rendered: renderTriggered,
      last_checked: new Date().toISOString()
    };
  }
  
  // 3. Write Central Director Dashboard report
  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));
  logSection('Autonomous Channel Director Executive Dashboard');
  console.log(`Executive Status Report successfully compiled:`);
  console.log(OUT_REPORT);
  console.log(`============================================================\n`);
}

main();
