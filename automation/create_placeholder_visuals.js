const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SCRIPT_ID = process.argv[2] || '4';
const WIDTH = 1920;
const HEIGHT = 1080;
const WORKSPACE_DIR = path.join(__dirname, '..');
const DATA_PATH = path.join(WORKSPACE_DIR, 'scripts', `video_${SCRIPT_ID}_data.js`);
const ASSETS_DIR = path.join(WORKSPACE_DIR, 'assets', `video_${SCRIPT_ID}_assets`);

if (!fs.existsSync(DATA_PATH)) {
  console.error(`Missing script data: ${DATA_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

const source = fs.readFileSync(DATA_PATH, 'utf8');
const match = source.match(new RegExp(`window\\.SCRIPTS\\[${SCRIPT_ID}\\]\\s*=\\s*(\\{[\\s\\S]+\\});`));
if (!match) {
  console.error(`Could not parse script data for video ${SCRIPT_ID}.`);
  process.exit(1);
}

const script = JSON.parse(match[1]);

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makePng(width, height, sceneIndex) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const hue = (sceneIndex * 37) % 360;
  const base = hslToRgb(hue, 0.48, 0.16);
  const accent = hslToRgb((hue + 32) % 360, 0.75, 0.42);

  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      const vignette = Math.min(1, Math.hypot((x - width / 2) / width, (y - height / 2) / height) * 1.9);
      const stripe = Math.sin((x + y + sceneIndex * 120) / 90) > 0.82 ? 0.26 : 0;
      raw[i] = clamp(base.r * (1 - vignette * 0.55) + accent.r * stripe);
      raw[i + 1] = clamp(base.g * (1 - vignette * 0.55) + accent.g * stripe);
      raw[i + 2] = clamp(base.b * (1 - vignette * 0.55) + accent.b * stripe);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

const manifest = [];
script.scenes.forEach((scene, index) => {
  const sceneNumber = index + 1;
  const outPath = path.join(ASSETS_DIR, `scene_${sceneNumber}_image.png`);
  fs.writeFileSync(outPath, makePng(WIDTH, HEIGHT, sceneNumber));
  manifest.push({
    scene_number: sceneNumber,
    title: scene.title,
    file: path.relative(WORKSPACE_DIR, outPath).replace(/\\/g, '/'),
    note: 'Fallback placeholder visual. Replace with generated or sourced production artwork before public publishing.'
  });
});

fs.writeFileSync(
  path.join(ASSETS_DIR, 'placeholder_visuals_manifest.json'),
  JSON.stringify({ video_id: SCRIPT_ID, generated_at: new Date().toISOString(), manifest }, null, 2)
);

console.log(`Generated ${manifest.length} fallback placeholder visuals for video ${SCRIPT_ID}.`);
