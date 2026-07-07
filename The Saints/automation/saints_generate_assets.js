/**
 * saints_generate_assets.js
 *
 * Generates local voiceover audio for The Saints scripts using the existing
 * offline Piper voice. Keeps Saints assets separate from Corporate Shadows.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const { REPO_ROOT, SAINTS_ROOT } = require('./channel_paths');

const ROOT = SAINTS_ROOT;
const SCRIPT_ID = process.argv[2] || '13';
const scenesArg = process.argv.find(arg => arg.startsWith('--scenes='));
const requestedScenes = scenesArg
  ? new Set(scenesArg.slice('--scenes='.length).split(',').map(Number).filter(Number.isInteger))
  : null;
const SCRIPT_PATH = path.join(ROOT, 'scripts', `saints_video_${SCRIPT_ID}_data.js`);
const ASSETS_DIR = path.join(ROOT, 'assets', `saints_video_${SCRIPT_ID}_assets`);
const PIPER_EXE = path.join(REPO_ROOT, 'automation', 'piper_tts', 'piper', 'piper.exe');
const isRussian = Number(SCRIPT_ID) >= 61 && Number(SCRIPT_ID) <= 68;
const MODEL_NAME = isRussian ? 'voice_ru.onnx' : 'voice.onnx';
const MODEL_PATH = path.join(REPO_ROOT, 'automation', 'piper_tts', 'piper', MODEL_NAME);

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
  try {
    execFileSync(PIPER_EXE, ['--model', MODEL_PATH, '--output_file', outputPath], {
      input: Buffer.from(text, 'utf8'),
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'inherit'] // pipe stdin, ignore stdout info, inherit stderr
    });
  } catch (e) {
    console.error(`Error in Piper generation for scene ${sceneNumber}: ${e.message}`);
    throw e;
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
    if (requestedScenes && !requestedScenes.has(sceneNumber)) return;
    const outputPath = path.join(ASSETS_DIR, `scene_${sceneNumber}_audio.wav`);
    const text = cleanVoiceover(scene.voiceover);
    console.log(`[Piper] Saints ${SCRIPT_ID} scene ${sceneNumber}...`);
    piper(text, outputPath, sceneNumber);
  });

  console.log(`Saints audio written to ${ASSETS_DIR}`);
}

main();
