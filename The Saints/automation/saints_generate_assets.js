/**
 * saints_generate_assets.js
 *
 * Generates local voiceover audio for The Saints scripts using the existing
 * offline Piper voice. Keeps Saints assets separate from Corporate Shadows.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { REPO_ROOT, SAINTS_ROOT } = require('./channel_paths');

const ROOT = SAINTS_ROOT;
const SCRIPT_ID = process.argv[2] || '13';
const SCRIPT_PATH = path.join(ROOT, 'scripts', `saints_video_${SCRIPT_ID}_data.js`);
const ASSETS_DIR = path.join(ROOT, 'assets', `saints_video_${SCRIPT_ID}_assets`);
const PIPER_EXE = path.join(REPO_ROOT, 'automation', 'piper_tts', 'piper', 'piper.exe');
const MODEL_PATH = path.join(REPO_ROOT, 'automation', 'piper_tts', 'piper', 'voice.onnx');

function loadScript() {
  const raw = fs.readFileSync(SCRIPT_PATH, 'utf8').replace(/^\uFEFF/, '');
  const re = new RegExp(`window\\.SAINTS_SCRIPTS\\[${SCRIPT_ID}\\]\\s*=\\s*(\\{[\\s\\S]+\\})\\s*;?\\s*$`);
  const match = raw.match(re);
  if (!match) throw new Error(`Could not parse SAINTS_SCRIPTS[${SCRIPT_ID}] from ${SCRIPT_PATH}`);
  return JSON.parse(match[1]);
}

function cleanVoiceover(text) {
  return String(text || '')
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function piper(text, outputPath, sceneNumber) {
  const tempTextPath = path.join(ASSETS_DIR, `temp_scene_${sceneNumber}.txt`);
  fs.writeFileSync(tempTextPath, text, 'utf8');
  try {
    execSync(`Get-Content "${tempTextPath}" | & "${PIPER_EXE}" --model "${MODEL_PATH}" --output_file "${outputPath}"`, {
      shell: 'powershell.exe',
      stdio: 'inherit',
      windowsHide: true
    });
  } finally {
    if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath);
  }
}

function main() {
  if (!fs.existsSync(SCRIPT_PATH)) throw new Error(`Missing Saints script: ${SCRIPT_PATH}`);
  if (!fs.existsSync(PIPER_EXE) || !fs.existsSync(MODEL_PATH)) throw new Error('Missing Piper executable or voice model.');
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const script = loadScript();
  console.log(`Generating Saints voiceover: ${script.video.title}`);

  script.scenes.forEach((scene, index) => {
    const sceneNumber = index + 1;
    const outputPath = path.join(ASSETS_DIR, `scene_${sceneNumber}_audio.wav`);
    const text = cleanVoiceover(scene.voiceover);
    console.log(`[Piper] Saints ${SCRIPT_ID} scene ${sceneNumber}...`);
    piper(text, outputPath, sceneNumber);
  });

  console.log(`Saints audio written to ${ASSETS_DIR}`);
}

main();
