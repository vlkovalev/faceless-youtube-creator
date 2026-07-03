/**
 * Standalone Microsoft Edge TTS Utility
 * 
 * Generates high-quality neural voiceovers for free using Microsoft Edge's translation API.
 * Uses the pre-installed `msedge-tts` library.
 * 
 * Usage:
 *   # Single line text to MP3
 *   node edge_tts_cli.js --text "Hello world" --out output.mp3
 * 
 *   # Single line text to WAV (uses ffmpeg to convert)
 *   node edge_tts_cli.js --text "Hello world" --out output.wav
 * 
 *   # Process a full video script scene-by-scene
 *   node edge_tts_cli.js --script scripts/video_1_data.js --video-id 1 --out-dir assets/video_1_assets
 * 
 *   # Custom voice choice
 *   node edge_tts_cli.js --text "Hello" --out output.mp3 --voice en-US-AndrewNeural
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Automatically add the local automation node_modules directory to the resolution path
const REPO_ROOT = path.resolve(__dirname, '..', '..');
module.paths.push(path.join(REPO_ROOT, 'automation', 'node_modules'));
module.paths.push(path.join(REPO_ROOT, 'Corporate Shadows', 'automation', 'node_modules'));

const { execSync } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// Default narrator voice (deep, professional storytelling style)
const DEFAULT_VOICE = 'en-US-ChristopherNeural';

function cleanTextForTts(text) {
    return String(text || '')
        .replace(/<span[^>]*>/gi, '')
        .replace(/<\/span>/gi, '')
        .replace(/<[^>]*>/g, '') // remove any other HTML tags
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Generate Edge TTS voiceover to an output file.
 * Automatically handles MP3 output, and converts to WAV if requested using ffmpeg.
 */
function generateTts(text, outPath, voiceName = DEFAULT_VOICE) {
    return new Promise(async (resolve, reject) => {
        try {
            const cleanText = cleanTextForTts(text);
            if (!cleanText) {
                return reject(new Error("Empty text provided."));
            }

            const tts = new MsEdgeTTS();
            await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
            
            const tempDir = path.dirname(outPath);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const { audioFilePath } = await tts.toFile(tempDir, cleanText);
            if (!fs.existsSync(audioFilePath)) {
                return reject(new Error("Audio file was not generated."));
            }

            // Convert to WAV if output path requests it
            if (outPath.toLowerCase().endsWith('.wav')) {
                const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';
                try {
                    execSync(`"${ffmpegBin}" -y -i "${audioFilePath}" "${outPath}"`, { stdio: 'ignore', windowsHide: true });
                    fs.unlinkSync(audioFilePath); // Clean up the temp MP3
                    resolve(outPath);
                } catch (convErr) {
                    console.warn(`[WARN] ffmpeg conversion failed, using raw file. Error: ${convErr.message}`);
                    fs.renameSync(audioFilePath, outPath);
                    resolve(outPath);
                }
            } else {
                // If MP3 is fine, rename/move directly
                fs.renameSync(audioFilePath, outPath);
                resolve(outPath);
            }
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Process a full scene script (window.SCRIPTS[N] format)
 */
async function processFullScript(scriptPath, videoId, outDir, voiceName) {
    if (!fs.existsSync(scriptPath)) {
        throw new Error(`Script file not found: ${scriptPath}`);
    }

    const src = fs.readFileSync(scriptPath, 'utf8');
    // Regex matches either window.SCRIPTS[N] or window.SAINTS_SCRIPTS[N]
    const match = src.match(/window\.(?:SAINTS_)?SCRIPTS\[\d+\]\s*=\s*(\{[\s\S]+\});?\s*$/) || src.match(/window\.[a-zA-Z_]+\s*=\s*(\{[\s\S]+\});?\s*$/);
    if (!match) {
        throw new Error(`Could not parse script format from ${scriptPath}`);
    }

    const data = JSON.parse(match[1]);
    const scenes = data.scenes || [];
    
    console.log(`🎙️ Starting batch script voiceover generation for video ${videoId}...`);
    console.log(`🎙️ Total scenes: ${scenes.length}`);
    console.log(`🎙️ Output dir: ${outDir}`);

    const results = [];
    for (const scene of scenes) {
        const num = String(scene.scene_number).padStart(2, '0');
        // Check if project expects WAV or MP3
        const outputExt = scene.audio_ext || 'mp3'; 
        const outPath = path.join(outDir, `scene_${num}_audio.${outputExt}`);
        
        console.log(`⏳ Processing Scene ${num}...`);
        await generateTts(scene.voiceover || '', outPath, voiceName);
        console.log(`   Saved: scene_${num}_audio.${outputExt}`);
        results.push(outPath);
    }
    return results;
}

// ── CLI Main ──────────────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    const get = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

    const text = get('--text');
    const out = get('--out');
    const scriptPath = get('--script');
    const videoId = get('--video-id');
    const outDir = get('--out-dir');
    const voiceName = get('--voice') || DEFAULT_VOICE;

    if (text && out) {
        console.log(`🎙️ Voice selected: ${voiceName}`);
        console.log(`⏳ Generating single voiceover...`);
        const result = await generateTts(text, out, voiceName);
        console.log(`✅ Success! Output file generated at: ${result}`);
        return;
    }

    if (scriptPath && videoId && outDir) {
        console.log(`🎙️ Voice selected: ${voiceName}`);
        const results = await processFullScript(scriptPath, videoId, outDir, voiceName);
        console.log(`✅ Success! Generated ${results.length} scene voiceovers.`);
        return;
    }

    // Print help menu
    console.log(`
Microsoft Edge TTS Standalone CLI

Usage:
  # Generate single line of text
  node edge_tts_cli.js --text "Your text here" --out output.mp3 [--voice en-US-ChristopherNeural]

  # Generate full scene script
  node edge_tts_cli.js --script "scripts/video_1_data.js" --video-id 1 --out-dir "assets/video_1_assets" [--voice en-US-ChristopherNeural]

Common Narrator Voices:
  - en-US-ChristopherNeural (Male, professional, standard storytelling)
  - en-US-AndrewNeural      (Male, deep, authoritative)
  - en-US-EricNeural        (Male, clear narration)
  - en-US-GuyNeural         (Male, standard assistant)
  - en-US-JennyNeural       (Female, pleasant narration)
  - en-GB-RyanNeural        (Male, strong British accent)
  - en-GB-SoniaNeural       (Female, pleasant British accent)
`);
}

if (require.main === module) {
    main().catch(err => {
        console.error("🔴 Error running Edge TTS:", err.message);
        process.exit(1);
    });
}
