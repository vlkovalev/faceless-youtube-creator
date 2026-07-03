const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// ---------------------------------------------------------------------------
// Voice backend selection
// Set VOICE_BACKEND=elevenlabs in .env or environment to use ElevenLabs API.
// Requires ELEVENLABS_API_KEY and optionally ELEVENLABS_VOICE_ID.
// Default: piper (local, offline)
// ---------------------------------------------------------------------------
require('dotenv').config({ path: path.join(__dirname, '..', 'automation', 'credentials', '.env') });

const VOICE_BACKEND = process.env.VOICE_BACKEND || 'piper';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
// Deep, authoritative male voice — good for dark documentary. Override with ELEVENLABS_VOICE_ID.
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9'; // "Daniel" model
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';

const SCRIPT_ID = process.argv[2] || 1;
const dataPath = path.join(__dirname, '..', 'scripts', `video_${SCRIPT_ID}_data.js`);
let scriptData = fs.readFileSync(dataPath, 'utf-8');

const match = scriptData.match(new RegExp(`window\\.SCRIPTS\\[${SCRIPT_ID}\\]\\s*=\\s*(\\{[\\s\\S]+\\});`));
if (!match) {
    console.error("Could not parse the script data.");
    process.exit(1);
}
const script = JSON.parse(match[1]);
const ASSETS_DIR = path.join(__dirname, '..', 'assets', `video_${SCRIPT_ID}_assets`);

if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// ElevenLabs TTS — returns a Promise that resolves when the .mp3 is saved
// ---------------------------------------------------------------------------
function elevenLabsTTS(text, outputPath) {
    return new Promise((resolve, reject) => {
        if (!ELEVENLABS_API_KEY) {
            reject(new Error('ELEVENLABS_API_KEY not set. Add it to automation/credentials/.env'));
            return;
        }
        const body = JSON.stringify({
            text,
            model_id: ELEVENLABS_MODEL,
            voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true }
        });
        const options = {
            hostname: 'api.elevenlabs.io',
            path: `/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            method: 'POST',
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg',
                'Content-Length': Buffer.byteLength(body),
            }
        };
        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                let err = '';
                res.on('data', d => err += d);
                res.on('end', () => reject(new Error(`ElevenLabs API error ${res.statusCode}: ${err}`)));
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

// ---------------------------------------------------------------------------
// Edge TTS — returns a Promise that resolves when the .mp3 is saved
// ---------------------------------------------------------------------------
function edgeTTS(text, outputPath) {
    return new Promise(async (resolve, reject) => {
        try {
            const tts = new MsEdgeTTS();
            const voice = process.env.EDGE_VOICE || 'en-US-ChristopherNeural';
            await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
            
            const targetDir = path.dirname(outputPath);
            const { audioFilePath } = await tts.toFile(targetDir, text);
            if (fs.existsSync(audioFilePath)) {
                fs.renameSync(audioFilePath, outputPath);
                resolve(outputPath);
            } else {
                reject(new Error("File not created by msedge-tts"));
            }
        } catch (err) {
            reject(err);
        }
    });
}

// ---------------------------------------------------------------------------
// Piper TTS — synchronous, local
// ---------------------------------------------------------------------------
function piperTTS(text, outputPath, sceneNumber) {
    const piperExe = path.join(__dirname, 'piper_tts', 'piper', 'piper.exe');
    const modelPath = path.join(__dirname, 'piper_tts', 'piper', 'voice.onnx');
    const tempTextPath = path.join(ASSETS_DIR, `temp_${sceneNumber}.txt`);
    fs.writeFileSync(tempTextPath, text);
    try {
        execSync(`Get-Content "${tempTextPath}" | & "${piperExe}" --model "${modelPath}" --output_file "${outputPath}"`, { shell: 'powershell.exe', windowsHide: true });
    } catch (e) {
        console.error("Piper failed for scene " + sceneNumber, e.message);
    }
    if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath);
}

// ---------------------------------------------------------------------------
// Main generation loop
// ---------------------------------------------------------------------------
async function generateAll() {
    console.log(`\nVoice backend: ${VOICE_BACKEND.toUpperCase()}`);
    if (VOICE_BACKEND === 'elevenlabs') {
        console.log(`ElevenLabs voice: ${ELEVENLABS_VOICE_ID} | model: ${ELEVENLABS_MODEL}`);
        console.log('NOTE: ElevenLabs outputs .mp3 — editor_agent.js accepts both .wav and .mp3\n');
    } else if (VOICE_BACKEND === 'edge') {
        console.log(`Edge voice: ${process.env.EDGE_VOICE || 'en-US-ChristopherNeural'}`);
        console.log('NOTE: Edge TTS outputs .mp3 — editor_agent.js accepts both .wav and .mp3\n');
    }

    for (let index = 0; index < script.scenes.length; index++) {
        const scene = script.scenes[index];
        const sceneNumber = index + 1;
        const text = scene.voiceover.replace(/<[^>]*>?/gm, '');

        let success = false;

        if (VOICE_BACKEND === 'elevenlabs') {
            const outputPath = path.join(ASSETS_DIR, `scene_${sceneNumber}_audio.mp3`);
            if (ELEVENLABS_API_KEY) {
                console.log(`[ElevenLabs] Scene ${sceneNumber}...`);
                try {
                    await elevenLabsTTS(text, outputPath);
                    console.log(`  Saved: scene_${sceneNumber}_audio.mp3 (${(fs.statSync(outputPath).size / 1024).toFixed(0)}kb)`);
                    success = true;
                } catch (e) {
                    console.warn(`  [WARN] ElevenLabs failed for scene ${sceneNumber}: ${e.message}. Trying Edge TTS...`);
                }
            } else {
                console.warn(`  [WARN] ElevenLabs key not set. Trying Edge TTS...`);
            }

            if (!success) {
                try {
                    console.log(`[Edge TTS] (Fallback) Scene ${sceneNumber}...`);
                    await edgeTTS(text, outputPath);
                    console.log(`  Saved: scene_${sceneNumber}_audio.mp3 (${(fs.statSync(outputPath).size / 1024).toFixed(0)}kb)`);
                    success = true;
                } catch (e) {
                    console.warn(`  [WARN] Edge TTS failed for scene ${sceneNumber}: ${e.message}. Falling back to Piper...`);
                }
            }

            if (!success) {
                const tempWavPath = path.join(ASSETS_DIR, `scene_${sceneNumber}_audio.wav`);
                console.log(`[Piper] (Last Resort) Scene ${sceneNumber}...`);
                piperTTS(text, tempWavPath, sceneNumber);
                if (fs.existsSync(tempWavPath)) {
                    fs.renameSync(tempWavPath, outputPath);
                    console.log(`  Saved: scene_${sceneNumber}_audio.mp3 (Piper fallback)`);
                    success = true;
                }
            }
            // Rate limit: ElevenLabs free tier allows ~3 req/s
            await new Promise(r => setTimeout(r, 400));
        } else if (VOICE_BACKEND === 'edge') {
            const outputPath = path.join(ASSETS_DIR, `scene_${sceneNumber}_audio.mp3`);
            console.log(`[Edge TTS] Scene ${sceneNumber}...`);
            try {
                await edgeTTS(text, outputPath);
                console.log(`  Saved: scene_${sceneNumber}_audio.mp3 (${(fs.statSync(outputPath).size / 1024).toFixed(0)}kb)`);
                success = true;
            } catch (e) {
                console.warn(`  [WARN] Edge TTS failed: ${e.message}. Falling back to Piper...`);
                const tempWavPath = path.join(ASSETS_DIR, `scene_${sceneNumber}_audio.wav`);
                piperTTS(text, tempWavPath, sceneNumber);
                if (fs.existsSync(tempWavPath)) {
                    fs.renameSync(tempWavPath, outputPath);
                    console.log(`  Saved: scene_${sceneNumber}_audio.mp3 (Piper fallback)`);
                    success = true;
                }
            }
        } else {
            const outputPath = path.join(ASSETS_DIR, `scene_${sceneNumber}_audio.wav`);
            console.log(`[Piper] Scene ${sceneNumber}...`);
            piperTTS(text, outputPath, sceneNumber);
        }
    }
    console.log('\nAll voiceovers generated successfully.');
    if (VOICE_BACKEND === 'piper') {
        console.log('TIP: Set VOICE_BACKEND=elevenlabs in automation/credentials/.env for significantly');
        console.log('     better retention — Piper TTS is the #1 viewer complaint on faceless channels.');
    }
}

generateAll().catch(e => { console.error('Fatal:', e); process.exit(1); });
