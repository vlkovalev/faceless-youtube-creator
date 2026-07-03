/**
 * Shorts Extractor
 *
 * Reads a video's script JSON and generates a 50–60s vertical-format Short
 * from the hook scenes (scenes 1–2 by default).
 *
 * Outputs:
 *   metadata/shorts/video_N_short_script.json   — cleaned Short script
 *   metadata/shorts/video_N_short_ffmpeg.sh     — ffmpeg command to cut the clip
 *
 * Usage:
 *   node shorts_extractor.js --video-id 1
 *   node shorts_extractor.js --video-id 1 --hook-scenes 1,2,3
 *
 * The ffmpeg command assumes the final visual-upgrade MP4 exists.
 * Run it on Windows with: bash metadata/shorts/video_1_short_ffmpeg.sh
 * or convert the paths for cmd.exe if needed.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '..');
const SHORTS_DIR    = path.join(WORKSPACE_DIR, 'metadata', 'shorts');

// Average narration reading speed (words per minute) used to estimate duration
const WPM = 135;

// Target Short duration window (seconds)
const SHORT_MIN_SEC = 45;
const SHORT_MAX_SEC = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(text) {
  return (text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text) {
  return stripHtml(text).split(/\s+/).filter(Boolean).length;
}

function estimateDurationSec(text) {
  return Math.round((wordCount(text) / WPM) * 60);
}

function parseVideoId(arg) {
  const m = String(arg || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function loadScript(videoId) {
  const scriptPath = path.join(WORKSPACE_DIR, 'scripts', `video_${videoId}_data.js`);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }
  const src   = fs.readFileSync(scriptPath, 'utf8');
  const match = src.match(/window\.SCRIPTS\[\d+\]\s*=\s*(\{[\s\S]+\});?\s*$/);
  if (!match) throw new Error(`Could not parse script JSON from ${scriptPath}`);
  return JSON.parse(match[1]);
}

function getFinalVideoPath(videoId) {
  const candidates = [
    path.join('videos', 'uploaded', `FINAL_VIDEO_${videoId}_VISUAL_UPGRADE.mp4`),
    path.join('videos', 'ready', `FINAL_VIDEO_${videoId}_VISUAL_UPGRADE.mp4`),
    `FINAL_VIDEO_${videoId}_VISUAL_UPGRADE.mp4`,
    `FINAL_VIDEO_${videoId}.mp4`,
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(WORKSPACE_DIR, candidate))) return candidate;
  }

  return null;
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Select hook scenes and trim voiceover to fit within SHORT_MAX_SEC.
 * Returns { scenes, estimatedDurationSec, narration }
 */
function buildShortScript(scenes, hookSceneNums) {
  const hookScenes = scenes.filter(s => hookSceneNums.includes(s.scene_number));
  if (!hookScenes.length) throw new Error(`No scenes found for numbers: ${hookSceneNums.join(', ')}`);

  const parts = [];
  let totalSec = 0;

  for (const scene of hookScenes) {
    const clean   = stripHtml(scene.voiceover || '');
    const secEst  = estimateDurationSec(clean);

    if (totalSec + secEst > SHORT_MAX_SEC) {
      // Trim this scene's sentences to fit
      const sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean];
      let partial = '';
      for (const sent of sentences) {
        const candidate = (partial + ' ' + sent).trim();
        if (estimateDurationSec(candidate) + totalSec <= SHORT_MAX_SEC) {
          partial = candidate;
        } else {
          break;
        }
      }
      if (partial) {
        parts.push({ scene_number: scene.scene_number, title: scene.title, narration: partial, trimmed: true });
        totalSec += estimateDurationSec(partial);
      }
      break;
    }

    parts.push({ scene_number: scene.scene_number, title: scene.title, narration: clean, trimmed: false });
    totalSec += secEst;
  }

  const narration = parts.map(p => p.narration).join(' ');
  return { parts, estimatedDurationSec: totalSec, narration, wordCount: wordCount(narration) };
}

/**
 * Generate the ffmpeg shell command to cut the Short clip.
 *
 * Since we don't have precise per-scene timecodes yet, we estimate offsets
 * from cumulative word counts across all scenes at WPM pace.
 *
 * The output is 9:16 (1080×1920), cropped from the centre of the 16:9 source.
 */
function buildFfmpegCommand(videoId, inputFile, durationSec, allScenes, hookSceneNums) {
  // Estimate start time as cumulative duration before the first hook scene
  const firstHookNum = Math.min(...hookSceneNums);
  let offsetSec = 0;
  for (const scene of allScenes) {
    if (scene.scene_number >= firstHookNum) break;
    offsetSec += estimateDurationSec(stripHtml(scene.voiceover || ''));
  }

  const outFile = `metadata/shorts/video_${videoId}_short.mp4`;

  // Crop 9:16 from centre of 1920×1080: crop width = 1080*9/16 = 607.5 → 608, height = 1080
  // Then scale to 1080×1920
  const cropW = 608;
  const cropH = 1080;
  const cropX = '(iw-608)/2';
  const cropY = '0';

  const lines = [
    `#!/usr/bin/env bash`,
    `# Auto-generated by shorts_extractor.js — video ${videoId}`,
    `# Estimated hook start: ~${offsetSec}s | estimated duration: ~${durationSec}s`,
    `# Adjust -ss and -t if the actual voiceover timecodes differ`,
    ``,
    `FFMPEG="${process.env.FFMPEG_PATH || 'ffmpeg'}"`,
    ``,
    `"$FFMPEG" \\`,
    `  -ss ${offsetSec} \\`,
    `  -i "${inputFile}" \\`,
    `  -t ${durationSec} \\`,
    `  -vf "crop=${cropW}:${cropH}:${cropX}:${cropY},scale=1080:1920:flags=lanczos" \\`,
    `  -c:v libx264 -preset fast -crf 18 \\`,
    `  -c:a aac -b:a 128k \\`,
    `  -movflags +faststart \\`,
    `  "${outFile}"`,
    ``,
    `echo "Short written to ${outFile}"`
  ];

  return { command: lines.join('\n'), outFile };
}

// ── YouTube Shorts metadata template ─────────────────────────────────────────

function buildShortsMetadata(videoData, shortScript, videoId) {
  const hookPart  = shortScript.parts[0] || {};
  const hookTitle = hookPart.title || videoData.video.title;
  const firstLine = hookPart.narration
    ? hookPart.narration.split('.')[0].trim() + '.'
    : '';

  return {
    suggested_title: `${firstLine} #Shorts`,
    description: [
      firstLine,
      '',
      `Full video: [link in description]`,
      '',
      '#Shorts #DarkHistory #CorporateScandal #Business #History'
    ].join('\n'),
    tags: ['Shorts', 'DarkHistory', 'CorporateScandal', 'Business', 'History'],
    category: 'Education',
    estimated_duration_sec: shortScript.estimatedDurationSec,
    word_count: shortScript.wordCount,
    hook_scenes: shortScript.parts.map(p => ({
      scene: p.scene_number,
      title: p.title,
      trimmed: p.trimmed,
      narration_preview: p.narration.slice(0, 120) + (p.narration.length > 120 ? '…' : '')
    })),
    full_narration: shortScript.narration
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const get  = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

  const videoIdArg     = get('--video-id');
  const hookScenesArg  = get('--hook-scenes'); // e.g. "1,2"

  if (!videoIdArg) {
    console.error('Usage: node shorts_extractor.js --video-id <N> [--hook-scenes 1,2]');
    process.exit(1);
  }

  const videoId      = parseVideoId(videoIdArg);
  const hookNums     = hookScenesArg
    ? hookScenesArg.split(',').map(n => parseInt(n.trim(), 10))
    : [1, 2];

  console.log(`[Shorts] Video ${videoId} — hook scenes: ${hookNums.join(', ')}`);

  const data         = loadScript(videoId);
  const scenes       = data.scenes || [];
  const shortScript  = buildShortScript(scenes, hookNums);

  console.log(`[Shorts] Estimated duration: ~${shortScript.estimatedDurationSec}s (${shortScript.wordCount} words)`);

  if (shortScript.estimatedDurationSec < SHORT_MIN_SEC) {
    console.warn(`[Shorts] WARNING: ${shortScript.estimatedDurationSec}s is under the ${SHORT_MIN_SEC}s minimum — add more hook scenes with --hook-scenes 1,2,3`);
  }

  const inputFile = getFinalVideoPath(videoId);
  if (!inputFile) {
    console.warn(`[Shorts] Final video not found for video ${videoId} — ffmpeg command will use a placeholder path`);
  }

  const { command, outFile } = buildFfmpegCommand(
    videoId,
    inputFile || `FINAL_VIDEO_${videoId}_VISUAL_UPGRADE.mp4`,
    shortScript.estimatedDurationSec,
    scenes,
    hookNums
  );

  const metadata = buildShortsMetadata(data, shortScript, videoId);

  fs.mkdirSync(SHORTS_DIR, { recursive: true });

  const scriptOut  = path.join(SHORTS_DIR, `video_${videoId}_short_script.json`);
  const ffmpegOut  = path.join(SHORTS_DIR, `video_${videoId}_short_ffmpeg.sh`);

  fs.writeFileSync(scriptOut, JSON.stringify(metadata, null, 2));
  fs.writeFileSync(ffmpegOut, command);

  console.log(`[Shorts] Script JSON → ${path.relative(WORKSPACE_DIR, scriptOut)}`);
  console.log(`[Shorts] ffmpeg cmd  → ${path.relative(WORKSPACE_DIR, ffmpegOut)}`);
  console.log(`\n── Short narration preview ──────────────────────────────────────────`);
  console.log(shortScript.narration.slice(0, 300) + (shortScript.narration.length > 300 ? '…' : ''));
}

if (require.main === module) main();

module.exports = { buildShortScript, buildFfmpegCommand, buildShortsMetadata };
