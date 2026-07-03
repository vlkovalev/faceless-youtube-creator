/**
 * saints_generate_prayer_assets.js
 *
 * Generates local voiceover audio for The Saints prayer companion scripts using the
 * offline Piper voice.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { REPO_ROOT, SAINTS_ROOT } = require('./channel_paths');

const ROOT = SAINTS_ROOT;
const SCRIPT_ID = process.argv[2] || '18';
const SCRIPT_PATH = path.join(ROOT, 'scripts', `saints_video_${SCRIPT_ID}_prayer_data.js`);
const ASSETS_DIR = path.join(ROOT, 'assets', `saints_video_${SCRIPT_ID}_assets`);
const PIPER_EXE = path.join(REPO_ROOT, 'automation', 'piper_tts', 'piper', 'piper.exe');
const MODEL_PATH = path.join(REPO_ROOT, 'automation', 'piper_tts', 'piper', 'voice.onnx');

function loadScript() {
  const raw = fs.readFileSync(SCRIPT_PATH, 'utf8').replace(/^\uFEFF/, '');
  const re = new RegExp(`window\\.SAINTS_PRAYER_COMPANIONS\\[${SCRIPT_ID}\\]\\s*=\\s*(\\{[\\s\\S]+\\})\\s*;?\\s*$`);
  const match = raw.match(re);
  if (!match) throw new Error(`Could not parse SAINTS_PRAYER_COMPANIONS[${SCRIPT_ID}] from ${SCRIPT_PATH}`);
  return JSON.parse(match[1]);
}

function cleanVoiceover(text) {
  return String(text || '')
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function piper(text, outputPath, sectionId) {
  const tempTextPath = path.join(ASSETS_DIR, `temp_section_${sectionId}.txt`);
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
  if (!fs.existsSync(SCRIPT_PATH)) throw new Error(`Missing Saints prayer script: ${SCRIPT_PATH}`);
  if (!fs.existsSync(PIPER_EXE) || !fs.existsSync(MODEL_PATH)) throw new Error('Missing Piper executable or voice model.');
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const script = loadScript();
  console.log(`Generating prayer voiceover: ${script.video.title}`);

  script.sections.forEach((section) => {
    if (section.voiceover) {
      const outputPath = path.join(ASSETS_DIR, `section_${section.section_id}_audio.wav`);
      const text = cleanVoiceover(section.voiceover);
      console.log(`[Piper] Section ${section.section_id}...`);
      piper(text, outputPath, section.section_id);
    }
  });

  console.log(`Saints prayer audio written to ${ASSETS_DIR}`);
}

main();
