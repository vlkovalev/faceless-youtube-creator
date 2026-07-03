/**
 * saints_create_scene_visuals.js
 *
 * Creates reverent scene-level SVG visuals for The Saints as production
 * placeholders when verified real assets have not yet been downloaded.
 * These are clean generated cards, not final real-source replacements.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_ID = process.argv[2] || '13';
const SCRIPT_PATH = path.join(ROOT, 'scripts', `saints_video_${SCRIPT_ID}_data.js`);
const ASSETS_DIR = path.join(ROOT, 'assets', `saints_video_${SCRIPT_ID}_assets`);

function loadScript() {
  const raw = fs.readFileSync(SCRIPT_PATH, 'utf8').replace(/^\uFEFF/, '');
  const re = new RegExp(`window\\.SAINTS_SCRIPTS\\[${SCRIPT_ID}\\]\\s*=\\s*(\\{[\\s\\S]+\\})\\s*;?\\s*$`);
  const match = raw.match(re);
  if (!match) throw new Error(`Could not parse SAINTS_SCRIPTS[${SCRIPT_ID}]`);
  return JSON.parse(match[1]);
}

function esc(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function wrap(text, max = 28) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > max) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function svgForScene(script, scene, index) {
  const lines = wrap(scene.title.toUpperCase(), 25);
  const palette = [
    ['#07090c', '#b99d61', '#334155'],
    ['#090806', '#d7b56d', '#4b3424'],
    ['#08110f', '#c6a15b', '#2d5548'],
    ['#0b0a10', '#c9b27a', '#45334f']
  ][index % 4];
  const [bg, gold, accent] = palette;
  const titleText = lines.map((line, i) => `<text x="135" y="${395 + i * 78}" font-size="62" font-weight="700" fill="#f7f2e8">${esc(line)}</text>`).join('\n');
  const subtitle = esc(script.video.title);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <radialGradient id="g" cx="72%" cy="42%" r="65%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.65"/>
      <stop offset="55%" stop-color="${bg}" stop-opacity="1"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="1"/>
    </radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="1920" height="1080" fill="url(#g)"/>
  <g opacity="0.22">
    <path d="M960 120 C1120 250 1220 390 1220 540 C1220 765 1070 900 960 960 C850 900 700 765 700 540 C700 390 800 250 960 120Z" fill="none" stroke="${gold}" stroke-width="8"/>
    <circle cx="960" cy="505" r="178" fill="none" stroke="${gold}" stroke-width="5"/>
    <path d="M960 295 L960 720 M780 505 L1140 505" stroke="${gold}" stroke-width="5"/>
  </g>
  <g opacity="0.16">
    ${Array.from({ length: 11 }).map((_, i) => `<line x1="${140 + i * 160}" y1="0" x2="${-80 + i * 160}" y2="1080" stroke="#ffffff" stroke-width="1"/>`).join('\n')}
  </g>
  <rect x="110" y="92" width="540" height="6" fill="${gold}"/>
  <text x="110" y="142" font-size="28" fill="#c9d0d8" letter-spacing="4">THE SAINTS / SCENE ${index + 1}</text>
  ${titleText}
  <text x="135" y="675" font-size="34" fill="#c9d0d8">${subtitle}</text>
  <rect x="0" y="1008" width="1920" height="8" fill="${gold}"/>
  <text x="135" y="1048" font-size="28" fill="#b8c0cc">holiness, suffering, courage, and grace</text>
</svg>`;
}

function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  const script = loadScript();
  script.scenes.forEach((scene, index) => {
    const out = path.join(ASSETS_DIR, `scene_${index + 1}_image.svg`);
    fs.writeFileSync(out, svgForScene(script, scene, index), 'utf8');
  });
  console.log(`Created ${script.scenes.length} Saints scene SVG visuals in ${ASSETS_DIR}`);
}

main();
