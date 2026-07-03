/**
 * SaaS Autopilot TTS (Text-to-Speech) Agent
 * ====================================
 * Reads a completed script JSON and generates voiceover audio files
 * for each scene using ElevenLabs API.
 *
 * Usage:
 *   node automation/saas_autopilot_tts_agent.js --topic SAAS-001
 *   node automation/saas_autopilot_tts_agent.js --topic SAAS-001 --dry-run
 *
 * Requires:
 *   ELEVENLABS_API_KEY env var set
 *   scripts/saas_autopilot/saas_001_data.json to exist with voiceover text filled in
 *
 * Output:
 *   assets/saas_autopilot_assets/saas_001/scene_N_audio.mp3 (one per scene)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url  = require('url');
const { exec, execFileSync } = require('child_process');

const WORKSPACE_DIR = path.join(__dirname, '..');
const SCRIPTS_DIR   = path.join(WORKSPACE_DIR, 'scripts', 'saas_autopilot');
const ASSETS_DIR    = path.join(WORKSPACE_DIR, 'assets', 'saas_autopilot_assets');
const ENV_PATH      = path.join(__dirname, 'credentials', '.env');

// Load environment variables
require('dotenv').config({ path: ENV_PATH });

// ── Config ────────────────────────────────────────────────────────────────────
const ELEVENLABS_API_KEY    = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID   = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'; // George — authoritative, clear
const ELEVENLABS_MODEL      = 'eleven_turbo_v2_5'; // Best quality/cost for narration
const ELEVENLABS_TTS_URL    = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const TOPIC_ID  = (args.topic || args.t || '').toUpperCase();
const DRY_RUN   = args['dry-run'] || false;
const OVERWRITE = args.overwrite || false;

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitizeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function stripPlaceholders(text) {
  // Remove [WRITE:...] and [EXPAND:...] scaffold placeholders
  return text
    .replace(/\[WRITE:[^\]]*\]/g, '')
    .replace(/\[EXPAND:[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPlaceholder(text) {
  return /\[WRITE:|EXPAND:/.test(text);
}

function generateAudio(text, outputPath) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.85,
        style: 0.15,
        use_speaker_boost: true
      }
    });

    const options = {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const url = new URL(ELEVENLABS_TTS_URL);
    options.hostname = url.hostname;
    options.path = url.pathname;

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errBody = '';
        res.on('data', d => errBody += d);
        res.on('end', () => reject(new Error(`ElevenLabs API error ${res.statusCode}: ${errBody}`)));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        fs.writeFileSync(outputPath, Buffer.concat(chunks));
        resolve(outputPath);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function generatePiperAudio(text, outputPath) {
  const piperBin = path.join(WORKSPACE_DIR, '..', 'automation', 'piper_tts', 'piper', 'piper.exe');
  const modelFile = path.join(WORKSPACE_DIR, '..', 'automation', 'piper_tts', 'piper', 'voice.onnx');
  const ffmpegBin = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');

  if (!fs.existsSync(piperBin) || !fs.existsSync(modelFile)) {
    throw new Error(`Piper binary or model not found. Checked: ${piperBin}`);
  }

  const tempWav = outputPath + '.wav';

  // Run Piper to output WAV
  execFileSync(piperBin, [
    '--model', modelFile,
    '--output_file', tempWav
  ], {
    input: text,
    windowsHide: true,
    encoding: 'utf8'
  });

  // Convert WAV to MP3 using local ffmpeg
  if (fs.existsSync(ffmpegBin)) {
    execFileSync(ffmpegBin, [
      '-i', tempWav,
      '-codec:a', 'libmp3lame', '-qscale:a', '2',
      outputPath, '-y'
    ], { windowsHide: true });
  } else {
    // Fallback: copy as is
    fs.copyFileSync(tempWav, outputPath);
  }

  // Clean up temp WAV
  if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!TOPIC_ID) {
    console.error('❌ Error: --topic is required. Example: node automation/saas_autopilot_tts_agent.js --topic SAAS-001');
    process.exit(1);
  }

  if (!ELEVENLABS_API_KEY && !DRY_RUN) {
    console.error('❌ Error: ELEVENLABS_API_KEY environment variable is not set.');
    console.error('   Set it with: set ELEVENLABS_API_KEY=your_key_here (Windows)');
    console.error('   Or: export ELEVENLABS_API_KEY=your_key_here (Mac/Linux)');
    process.exit(1);
  }

  const scriptId  = sanitizeId(TOPIC_ID);
  const scriptPath = path.join(SCRIPTS_DIR, `${scriptId}_data.json`);

  if (!fs.existsSync(scriptPath)) {
    console.error(`❌ Error: Script not found at ${scriptPath}`);
    console.error(`   Run first: node automation/saas_autopilot_script_agent.js --topic ${TOPIC_ID}`);
    process.exit(1);
  }

  const script      = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  const assetsDir   = path.join(ASSETS_DIR, scriptId);

  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  console.log(`\n🎙️  SaaS Autopilot TTS Agent`);
  console.log(`   Topic: ${script.video.id} — ${script.video.title}`);
  console.log(`   Voice: ${ELEVENLABS_VOICE_ID} (Local or Cloud)`);
  console.log(`   Model: ${ELEVENLABS_MODEL}`);
  if (DRY_RUN) console.log(`   Mode: DRY RUN — no API calls\n`);
  console.log('');

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const scene of script.scenes) {
    const outputFile = path.join(assetsDir, `scene_${scene.scene_number}_audio.mp3`);
    const rawText    = scene.voiceover || '';

    if (hasPlaceholder(rawText)) {
      console.warn(`⚠️  Scene ${scene.scene_number} "${scene.title}": voiceover has unfilled [WRITE:...] placeholder — skipping.`);
      console.warn(`   Fill in the voiceover text in ${scriptPath} then re-run.`);
      skipCount++;
      continue;
    }

    const cleanText = stripPlaceholders(rawText);
    if (!cleanText) {
      console.warn(`⚠️  Scene ${scene.scene_number}: empty voiceover — skipping.`);
      skipCount++;
      continue;
    }

    if (fs.existsSync(outputFile) && !OVERWRITE) {
      console.log(`⏭️  Scene ${scene.scene_number}: audio already exists — skipping (use --overwrite to regenerate).`);
      skipCount++;
      continue;
    }

    if (DRY_RUN) {
      const wordCount = cleanText.split(/\s+/).length;
      const estSec    = Math.round(wordCount / 2.2); // ~132 wpm
      console.log(`[DRY RUN] Scene ${scene.scene_number} "${scene.title}": ${wordCount} words ~${estSec}s → would write to ${outputFile}`);
      successCount++;
      continue;
    }

    try {
      process.stdout.write(`🎙️  Scene ${scene.scene_number} "${scene.title}"... `);
      const backend = (process.env.VOICE_BACKEND || 'elevenlabs').toLowerCase();
      if (backend === 'piper' || !ELEVENLABS_API_KEY) {
        generatePiperAudio(cleanText, outputFile);
        console.log(`✅ [Piper] → ${path.basename(outputFile)}`);
      } else {
        try {
          await generateAudio(cleanText, outputFile);
          const stats = fs.statSync(outputFile);
          console.log(`✅ ${(stats.size / 1024).toFixed(0)}KB → ${path.basename(outputFile)}`);
        } catch (elevenErr) {
          console.warn(`\n⚠️  ElevenLabs failed (${elevenErr.message}). Falling back to Piper...`);
          generatePiperAudio(cleanText, outputFile);
          console.log(`✅ [Piper Fallback] → ${path.basename(outputFile)}`);
        }
      }
      successCount++;
    } catch (err) {
      console.error(`\n❌ Scene ${scene.scene_number} failed: ${err.message}`);
      errorCount++;
    }
  }

  console.log('');
  console.log(`=================================================`);
  console.log(`  TTS complete: ${successCount} generated, ${skipCount} skipped, ${errorCount} errors`);
  if (errorCount === 0 && skipCount === 0) {
    console.log(`\n📋 Next step:`);
    console.log(`   node automation/saas_autopilot_editor_agent.js --topic ${TOPIC_ID}`);
  } else if (skipCount > 0) {
    console.log(`\n⚠️  Fill in remaining voiceover placeholders in:`);
    console.log(`   scripts/saas_autopilot/${scriptId}_data.json`);
  }
  console.log(`=================================================\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
