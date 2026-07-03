/**
 * saas_autopilot_compile_omni_video.js — SaaS Autopilot Mega-Compilation Creator with Auto-Chapters
 * =========================================================================
 * Dynamically looks for all produced SaaS Autopilot videos (SAAS_N_FINAL.mp4) under the
 * videos folder, sorts them, and uses FFmpeg copy concatenation for zero
 * quality loss and near-instant compiling into a single mega-compilation.
 *
 * It also uses ffprobe to dynamically calculate the cumulative duration of
 * each episode and generates a standard YouTube Chapters timestamp list
 * saved to metadata/FINAL_SAAS_OMNI_VIDEO_chapters.txt.
 *
 * Usage:
 *   node SaaS Autopilot/automation/saas_autopilot_compile_omni_video.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const AUTOMATION_DIR = __dirname;
const WORKSPACE_DIR  = path.join(AUTOMATION_DIR, '..');
const VIDEOS_DIR     = path.join(WORKSPACE_DIR, 'videos', 'saas_autopilot');
const METADATA_DIR   = path.join(WORKSPACE_DIR, 'metadata');

const LOCAL_FFMPEG   = path.join(AUTOMATION_DIR, 'ffmpeg', 'bin', 'ffmpeg.exe');
const LOCAL_FFPROBE  = path.join(AUTOMATION_DIR, 'ffmpeg', 'bin', 'ffprobe.exe');

function findFfmpeg() {
  if (fs.existsSync(LOCAL_FFMPEG)) return LOCAL_FFMPEG;
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  try {
    const result = spawnSync('where.exe', ['ffmpeg'], { encoding: 'utf8', windowsHide: true });
    return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  } catch {
    throw new Error('ffmpeg not found. Make sure ffmpeg is in your PATH.');
  }
}

function findFfprobe() {
  if (fs.existsSync(LOCAL_FFPROBE)) return LOCAL_FFPROBE;
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) return process.env.FFPROBE_PATH;
  try {
    const result = spawnSync('where.exe', ['ffprobe'], { encoding: 'utf8', windowsHide: true });
    return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  } catch {
    throw new Error('ffprobe not found. Make sure ffprobe is in your PATH.');
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getEpisodeTitle(fileName, config) {
  // Extract topic number e.g. SAAS_003_FINAL.mp4 -> SAAS-003
  const match = fileName.match(/^SAAS_(\d+)_FINAL\.mp4$/i);
  if (!match) return fileName;
  const topicId = `SAAS-${match[1]}`;
  const backlog = config.topic_backlog || [];
  const entry = backlog.find(e => e.id.toUpperCase() === topicId.toUpperCase());
  return entry ? entry.title : `Episode ${parseInt(match[1], 10)}`;
}

function main() {
  console.log(`\n=============================================================`);
  console.log(`  🎬 SaaS Autopilot SaaS Autopilot Mega-Compilation Creator`);
  console.log(`=============================================================\n`);

  if (!fs.existsSync(VIDEOS_DIR)) {
    console.error(`❌ Videos folder not found at: ${VIDEOS_DIR}`);
    process.exit(1);
  }

  const ffmpegBin = findFfmpeg();
  const ffprobeBin = findFfprobe();
  console.log(`✅ Using FFmpeg: ${ffmpegBin}`);
  console.log(`✅ Using FFprobe: ${ffprobeBin}`);

  // Find all SAAS_N_FINAL.mp4 video files
  const files = fs.readdirSync(VIDEOS_DIR);
  const videoFiles = files.filter(f => f.match(/^SAAS_\d+_FINAL\.mp4$/i)).sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)[0], 10);
    const numB = parseInt(b.match(/\d+/)[0], 10);
    return numA - numB;
  });

  if (videoFiles.length === 0) {
    console.log(`❌ No completed B2B episodes found in: ${VIDEOS_DIR}`);
    process.exit(1);
  }

  console.log(`📊 Found ${videoFiles.length} completed episodes to compile:`);
  videoFiles.forEach(f => console.log(`   👉 ${f}`));

  // Generate Chapters List
  const configPath = path.join(WORKSPACE_DIR, 'saas_autopilot_channel_config.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

  console.log(`\n📊 Calculating timestamps and generating chapters...`);
  let cumulativeSeconds = 0;
  const chapters = [];

  for (const f of videoFiles) {
    const videoPath = path.join(VIDEOS_DIR, f);
    
    // Get duration using ffprobe
    const probe = spawnSync(ffprobeBin, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ], { encoding: 'utf8', windowsHide: true });

    if (probe.status !== 0) {
      console.warn(`⚠️ Could not read duration for ${f}`);
      continue;
    }

    const duration = parseFloat(probe.stdout.trim());
    if (isNaN(duration)) {
      console.warn(`⚠️ Invalid duration parsed for ${f}`);
      continue;
    }

    const title = getEpisodeTitle(f, config);
    const timestampStr = formatTime(cumulativeSeconds);
    chapters.push(`${timestampStr} - ${title}`);

    cumulativeSeconds += duration;
  }

  const chaptersTxtPath = path.join(METADATA_DIR, 'FINAL_SAAS_OMNI_VIDEO_chapters.txt');
  fs.writeFileSync(chaptersTxtPath, chapters.join('\n'), 'utf8');
  console.log(`💾 Saved chapters to: ${chaptersTxtPath}`);
  console.log(`\n📋 YouTube Chapters List (copy into video description):\n`);
  console.log(chapters.join('\n'));
  console.log();

  console.log(`\n🔗 Generating inputs list...`);
  const inputsTxtPath = path.join(WORKSPACE_DIR, 'inputs_saas.txt');
  const inputsContent = videoFiles.map(f => `file '${path.join(VIDEOS_DIR, f).replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(inputsTxtPath, inputsContent, 'utf8');

  const finalVideoPath = path.join(VIDEOS_DIR, 'FINAL_SAAS_OMNI_VIDEO.mp4');
  console.log(`📤 Compiling into: ${finalVideoPath}...`);

  const result = spawnSync(ffmpegBin, [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', inputsTxtPath,
    '-c', 'copy',
    finalVideoPath
  ], { stdio: 'inherit', windowsHide: true });

  // Cleanup inputs_saas.txt
  if (fs.existsSync(inputsTxtPath)) fs.unlinkSync(inputsTxtPath);

  if (result.status !== 0) {
    console.error('❌ FFmpeg compilation failed.');
    process.exit(1);
  }

  const stats = fs.statSync(finalVideoPath);
  console.log(`\n🏆 Mega compilation finished successfully!`);
  console.log(`✅ File written to: ${finalVideoPath}`);
  console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(1)}MB\n`);
}

main();
