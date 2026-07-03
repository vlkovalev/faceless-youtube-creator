/**
 * ElevenLabs TTS backend
 *
 * Usage:
 *   node elevenlabs_tts.js --text "Hello world" --out scene_1_audio.wav
 *   node elevenlabs_tts.js --script ../scripts/video_1_data.js --video-id 1 --out-dir ../assets/video_1_assets
 *
 * Config: Set VOICE_BACKEND=elevenlabs in channel_config.json (or env var VOICE_BACKEND=elevenlabs).
 * Requires env var ELEVENLABS_API_KEY.
 *
 * Falls back to Piper automatically if ELEVENLABS_API_KEY is not set.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync, execSync } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const WORKSPACE_DIR = path.join(__dirname, '..');
const CONFIG_PATH   = path.join(WORKSPACE_DIR, 'channel_config.json');

// ── Config ────────────────────────────────────────────────────────────────────

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function getVoiceBackend() {
  if (process.env.VOICE_BACKEND) return process.env.VOICE_BACKEND;
  const cfg = readConfig();
  return (cfg.voice_backend || 'piper').toLowerCase();
}

function getElevenLabsKey() {
  return process.env.ELEVENLABS_API_KEY || '';
}

// ── ElevenLabs API ────────────────────────────────────────────────────────────

const ELEVENLABS_DEFAULT_VOICE_ID  = 'JBFqnCBsd6RMkjVDRZzb'; // "George" — deep, authoritative
const ELEVENLABS_DEFAULT_MODEL     = 'eleven_multilingual_v2';

/**
 * Fetch TTS audio from ElevenLabs and write to outPath as PCM WAV.
 * @param {string} text
 * @param {string} outPath  - .wav destination
 * @param {object} opts     - { voiceId, modelId, stability, similarityBoost, style }
 */
function elevenLabsTts(text, outPath, opts = {}) {
  const apiKey   = getElevenLabsKey();
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY env var is not set.');

  const voiceId  = opts.voiceId  || ELEVENLABS_DEFAULT_VOICE_ID;
  const modelId  = opts.modelId  || ELEVENLABS_DEFAULT_MODEL;

  const body = JSON.stringify({
    text,
    model_id: modelId,
    voice_settings: {
      stability:        opts.stability       ?? 0.50,
      similarity_boost: opts.similarityBoost ?? 0.75,
      style:            opts.style           ?? 0.30,
      use_speaker_boost: true
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.elevenlabs.io',
        path: `/v1/text-to-speech/${voiceId}?output_format=pcm_44100`,
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'xi-api-key':    apiKey,
          'Accept':        'audio/mpeg',   // fallback if PCM not supported
          'Content-Length': Buffer.byteLength(body)
        }
      },
      res => {
        if (res.statusCode !== 200) {
          let err = '';
          res.on('data', chunk => { err += chunk; });
          res.on('end', () => reject(new Error(`ElevenLabs API ${res.statusCode}: ${err}`)));
          return;
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          // ElevenLabs returns raw PCM when output_format=pcm_44100.
          // Wrap in a minimal WAV header so downstream tools (ffmpeg) can read it.
          const wav = pcmToWav(raw, 1, 44100, 16);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, wav);
          resolve(outPath);
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Wrap raw 16-bit PCM in a RIFF/WAV header */
function pcmToWav(pcmBuf, numChannels, sampleRate, bitsPerSample) {
  const byteRate    = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign  = numChannels * (bitsPerSample / 8);
  const dataSize    = pcmBuf.length;
  const header      = Buffer.alloc(44);

  header.write('RIFF',          0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE',          8);
  header.write('fmt ',         12);
  header.writeUInt32LE(16,     16);   // PCM chunk size
  header.writeUInt16LE(1,      20);   // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate,  24);
  header.writeUInt32LE(byteRate,    28);
  header.writeUInt16LE(blockAlign,  32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data',         36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuf]);
}

// ── Edge TTS passthrough ──────────────────────────────────────────────────────
function edgeTts(text, outPath, opts = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const tts = new MsEdgeTTS();
      const voice = opts.voiceId || process.env.EDGE_VOICE || 'en-US-ChristopherNeural';
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      
      const tempDir = path.dirname(outPath);
      const { audioFilePath } = await tts.toFile(tempDir, text);
      
      if (!fs.existsSync(audioFilePath)) {
        throw new Error("Edge TTS file creation failed");
      }
      
      if (outPath.endsWith('.wav')) {
        const ffmpegBin = process.env.FFMPEG_PATH || (fs.existsSync(path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe')) 
          ? path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe') 
          : 'ffmpeg');
        
        try {
          execSync(`"${ffmpegBin}" -y -i "${audioFilePath}" "${outPath}"`, { stdio: 'ignore', windowsHide: true });
          if (fs.existsSync(audioFilePath)) {
            fs.unlinkSync(audioFilePath);
          }
          resolve(outPath);
        } catch (convErr) {
          console.warn(`[TTS] ffmpeg conversion failed, copying raw file to ${outPath}: ${convErr.message}`);
          fs.renameSync(audioFilePath, outPath);
          resolve(outPath);
        }
      } else {
        fs.renameSync(audioFilePath, outPath);
        resolve(outPath);
      }
    } catch (err) {
      reject(err);
    }
  });
}

// ── Piper passthrough ─────────────────────────────────────────────────────────

/**
 * Delegate to the existing Piper pipeline (piper_tts/).
 * Adjust the path to your piper binary/script if it differs.
 */
function piperTts(text, outPath) {
  const piperDir    = path.join(__dirname, 'piper_tts', 'piper');
  const piperBin    = path.join(piperDir, 'piper.exe');
  const modelFile   = path.join(piperDir, 'voice.onnx');

  if (!fs.existsSync(piperBin)) {
    throw new Error(`Piper binary not found at ${piperBin}. Set VOICE_BACKEND=elevenlabs or install Piper.`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  execFileSync(piperBin, [
    '--model', modelFile,
    '--output_file', outPath
  ], {
    input: text,
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'ignore']
  });

  return outPath;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate TTS for text → outPath.
 * Automatically selects backend from config / env.
 */
async function generateTts(text, outPath, opts = {}) {
  const backend = getVoiceBackend();

  // Strip HTML span tags from voiceover text before sending to TTS
  const cleanText = text
    .replace(/<span[^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  // Smart fallback hierarchy starting with ElevenLabs if selected
  if (backend === 'elevenlabs') {
    if (getElevenLabsKey()) {
      try {
        console.log(`[TTS] ElevenLabs (Primary) → ${path.basename(outPath)}`);
        return await elevenLabsTts(cleanText, outPath, opts);
      } catch (err) {
        console.warn(`[TTS] ElevenLabs failed: ${err.message}. Falling back to Edge TTS.`);
      }
    } else {
      console.warn('[TTS] ELEVENLABS_API_KEY not set. Falling back to Edge TTS.');
    }
    
    // Fallback to Edge TTS (Tier 2)
    try {
      console.log(`[TTS] Edge TTS (Fallback) → ${path.basename(outPath)}`);
      return await edgeTts(cleanText, outPath, opts);
    } catch (edgeErr) {
      console.warn(`[TTS] Edge TTS failed: ${edgeErr.message}. Falling back to Piper.`);
    }

    // Last resort: Piper (Tier 3)
    console.log(`[TTS] Piper (Last Resort) → ${path.basename(outPath)}`);
    return piperTts(cleanText, outPath);
  }

  // If backend is explicitly set to edge
  if (backend === 'edge') {
    try {
      console.log(`[TTS] Edge TTS → ${path.basename(outPath)}`);
      return await edgeTts(cleanText, outPath, opts);
    } catch (edgeErr) {
      console.warn(`[TTS] Edge TTS failed: ${edgeErr.message}. Falling back to Piper.`);
    }
    console.log(`[TTS] Piper (Fallback) → ${path.basename(outPath)}`);
    return piperTts(cleanText, outPath);
  }

  // Default / Explicit Piper
  console.log(`[TTS] Piper → ${path.basename(outPath)}`);
  return piperTts(cleanText, outPath);
}

/**
 * Batch-generate TTS for all scenes in a script data file.
 * @param {number|string} videoId   - e.g. 1
 * @param {string}        outDir    - e.g. assets/video_1_assets
 */
async function generateSceneAudio(videoId, outDir) {
  const scriptPath = path.join(WORKSPACE_DIR, 'scripts', `video_${videoId}_data.js`);
  if (!fs.existsSync(scriptPath)) throw new Error(`Script not found: ${scriptPath}`);

  // The script files use window.SCRIPTS[N] = {...}. Extract via regex (no eval).
  const src    = fs.readFileSync(scriptPath, 'utf8');
  const match  = src.match(/window\.SCRIPTS\[\d+\]\s*=\s*(\{[\s\S]+\});?\s*$/);
  if (!match) throw new Error(`Could not parse script JSON from ${scriptPath}`);
  const data   = JSON.parse(match[1]);
  const scenes = data.scenes || [];

  const results = [];
  for (const scene of scenes) {
    const num     = String(scene.scene_number).padStart(2, '0');
    const outPath = path.join(WORKSPACE_DIR, outDir, `scene_${num}_audio.wav`);
    await generateTts(scene.voiceover || '', outPath);
    results.push({ scene: scene.scene_number, out: path.relative(WORKSPACE_DIR, outPath) });
  }
  return results;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const get  = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

  const text     = get('--text');
  const out      = get('--out');
  const scriptFg = get('--script');   // not used when videoId provided
  const videoId  = get('--video-id');
  const outDir   = get('--out-dir');

  if (videoId && outDir) {
    console.log(`[TTS] Generating all scene audio for video ${videoId} → ${outDir}`);
    const results = await generateSceneAudio(videoId, outDir);
    results.forEach(r => console.log(`  scene ${r.scene} → ${r.out}`));
    return;
  }

  if (text && out) {
    await generateTts(text, out);
    console.log(`[TTS] Written: ${out}`);
    return;
  }

  console.log(`
Usage:
  # Single line
  node elevenlabs_tts.js --text "Hello world" --out output.wav

  # All scenes in a video
  node elevenlabs_tts.js --video-id 1 --out-dir ../assets/video_1_assets

Environment:
  ELEVENLABS_API_KEY   Your ElevenLabs API key
  VOICE_BACKEND        piper | elevenlabs  (default: from channel_config.json or "piper")

channel_config.json key:
  "voice_backend": "elevenlabs"
`);
}

if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { generateTts, generateSceneAudio, elevenLabsTts, piperTts };
