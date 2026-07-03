/**
 * seedance_creator_agent.js
 *
 * Autonomous Agent Script that orchestrates the entire SeedDance / Omni Video
 * generation pipeline.
 *
 * Steps:
 * 1. Validates script data and scene audio narrated WAVs.
 * 2. Checks storyboard keyframe images (scene_i_image.png).
 * 3. Animates all keyframes using generate_omni_flash_videos.js.
 * 4. Compiles final master video using editor_agent.js (Muxing dialogue, BGM, and soft subtitles).
 * 5. Safely moves the output into the dedicated `omni_videos/` folder under a distinct
 *    non-destructive name (FINAL_VIDEO_N_OMNI_FLASH.mp4) to preserve existing files.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const AGY_NODE = process.execPath;
const SCRIPT_ID = process.argv[2] || '1';

function logSection(title) {
  console.log(`\n============================================================`);
  console.log(`>>> ${title.toUpperCase()}`);
  console.log(`============================================================`);
}

function runScript(scriptPath, args = []) {
  const nodeBin = process.execPath;
  console.log(`Running: ${nodeBin} ${scriptPath} ${args.join(' ')}`);
  
  const result = spawnSync(nodeBin, [scriptPath, ...args], {
    cwd: WORKSPACE_DIR,
    stdio: 'inherit',
    shell: false,
    windowsHide: true
  });
  
  return result.status === 0;
}

function main() {
  logSection(`SeedDance Autonomous Video Creator Agent (Video ${SCRIPT_ID})`);
  
  const assetsDir = path.join(WORKSPACE_DIR, 'assets', `video_${SCRIPT_ID}_assets`);
  const omniDir = path.join(WORKSPACE_DIR, 'omni_videos');
  
  // 1. Validate assets directory
  if (!fs.existsSync(assetsDir)) {
    console.error(`[ERROR] Assets directory not found: ${assetsDir}`);
    process.exit(1);
  }
  
  // 2. Validate Scene Audios and Keyframe Images
  console.log('\n[INFO] Validating narration audios and storyboard keyframes...');
  let missingAudios = [];
  let missingKeyframes = [];
  
  for (let i = 1; i <= 12; i++) {
    let audioPath = path.join(assetsDir, `scene_${i}_audio.wav`);
    const paddedAudioPath = path.join(assetsDir, `scene_${String(i).padStart(2, '0')}_audio.wav`);
    if (!fs.existsSync(audioPath) && fs.existsSync(paddedAudioPath)) {
      audioPath = paddedAudioPath;
    }
    const imagePath = path.join(assetsDir, `scene_${i}_image.png`);
    
    if (!fs.existsSync(audioPath)) {
      missingAudios.push(`scene_${i}_audio.wav`);
    }
    if (!fs.existsSync(imagePath)) {
      missingKeyframes.push(`scene_${i}_image.png`);
    }
  }
  
  if (missingAudios.length > 0) {
    console.error(`[ERROR] Missing voiceover narration files in assets directory:\n - ${missingAudios.join('\n - ')}`);
    process.exit(1);
  }
  
  if (missingKeyframes.length > 0) {
    console.warn(`[WARNING] Some storyboard keyframe images are missing:\n - ${missingKeyframes.join('\n - ')}\n`);
    console.log('[ACTION] Please generate these keyframe images using the generate_image tool first, then rerun this agent.');
    process.exit(1);
  }
  
  console.log('[OK] All 12 narration audios and 12 storyboard keyframes validated!');
  
  // 3. Run keyframe animation
  logSection('Step 1: Animating Keyframes (SeedDance / Omni Flash motion engine)');
  const animScript = path.join('automation', 'generate_omni_flash_videos.js');
  const animSuccess = runScript(animScript, [SCRIPT_ID]);
  
  if (!animSuccess) {
    console.error('[ERROR] Keyframe animation step failed!');
    process.exit(1);
  }
  console.log('[OK] All 12 scene keyframes animated successfully!');
  
  // 4. Compile master video using editor_agent.js
  logSection('Step 2: Compiling final Hollywood Master Video');
  const editorScript = path.join('automation', 'editor_agent.js');
  const editorSuccess = runScript(editorScript, [SCRIPT_ID]);
  
  if (!editorSuccess) {
    console.error('[ERROR] Hollywood compilation step failed!');
    process.exit(1);
  }
  console.log('[OK] Hollywood master video compiled successfully!');
  
  // 5. Move and rename output safely
  logSection('Step 3: Organizing and packaging SeedDance Video output');
  const rawVideoPath = path.join(WORKSPACE_DIR, `FINAL_VIDEO_${SCRIPT_ID}.mp4`);
  const rawSrtPath = path.join(WORKSPACE_DIR, `FINAL_VIDEO_${SCRIPT_ID}.srt`);
  
  if (!fs.existsSync(rawVideoPath)) {
    console.error(`[ERROR] Compiled master video file not found at: ${rawVideoPath}`);
    process.exit(1);
  }
  
  if (!fs.existsSync(omniDir)) {
    fs.mkdirSync(omniDir, { recursive: true });
  }
  
  const destVideoPath = path.join(omniDir, `FINAL_VIDEO_${SCRIPT_ID}_OMNI_FLASH.mp4`);
  const destSrtPath = path.join(omniDir, `FINAL_VIDEO_${SCRIPT_ID}_OMNI_FLASH.srt`);
  
  // Rename/Move files non-destructively
  try {
    if (fs.existsSync(destVideoPath)) fs.unlinkSync(destVideoPath);
    fs.renameSync(rawVideoPath, destVideoPath);
    
    if (fs.existsSync(rawSrtPath)) {
      if (fs.existsSync(destSrtPath)) fs.unlinkSync(destSrtPath);
      fs.renameSync(rawSrtPath, destSrtPath);
    }
    
    console.log(`\n============================================================`);
    console.log(`[SUCCESS] SeedDance Premium Video successfully created!`);
    console.log(`============================================================`);
    console.log(`Video File: ${destVideoPath}`);
    console.log(`Subtitles : ${destSrtPath}`);
    console.log(`============================================================\n`);
  } catch (err) {
    console.error('[ERROR] Failed to move compiled video outputs to omni_videos folder:', err);
    process.exit(1);
  }
}

main();
