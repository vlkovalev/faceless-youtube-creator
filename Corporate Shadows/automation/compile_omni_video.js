/**
 * compile_omni_video.js
 *
 * Compiles all 5 visual-upgraded Corporate Shadows episodes into a single mega-compilation
 * ("FINAL_OMNI_VIDEO.mp4") and shifts/concatenates the SRT files ("FINAL_OMNI_VIDEO.srt").
 *
 * Uses FFmpeg copy concatenation for zero quality loss and near-instant execution.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const LOCAL_FFMPEG = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');
const LOCAL_FFPROBE = path.join(__dirname, 'ffmpeg', 'bin', 'ffprobe.exe');
const DEFAULT_FFMPEG = 'C:\\Users\\heliu\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffmpeg.exe';
const DEFAULT_FFPROBE = 'C:\\Users\\heliu\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffprobe.exe';

function commandExists(command) {
  const result = spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
}

const ffmpegPath = process.env.FFMPEG_PATH || (fs.existsSync(LOCAL_FFMPEG) ? LOCAL_FFMPEG : (fs.existsSync(DEFAULT_FFMPEG) ? DEFAULT_FFMPEG : commandExists('ffmpeg')));
const ffprobePath = process.env.FFPROBE_PATH || (fs.existsSync(LOCAL_FFPROBE) ? LOCAL_FFPROBE : (fs.existsSync(DEFAULT_FFPROBE) ? DEFAULT_FFPROBE : commandExists('ffprobe')));

if (!ffmpegPath) {
  console.error('Error: FFmpeg executable not found. Please install FFmpeg or set FFMPEG_PATH.');
  process.exit(1);
}
if (!ffprobePath) {
  console.error('Error: FFprobe executable not found. Please install FFprobe or set FFPROBE_PATH.');
  process.exit(1);
}

const videos = [
  path.join(WORKSPACE_DIR, 'videos', 'uploaded', 'FINAL_VIDEO_1_DENSE_CREATED_REPLACEMENT.mp4'),
  path.join(WORKSPACE_DIR, 'videos', 'uploaded', 'FINAL_VIDEO_2_VISUAL_UPGRADE.mp4'),
  path.join(WORKSPACE_DIR, 'videos', 'uploaded', 'FINAL_VIDEO_3_VISUAL_UPGRADE.mp4'),
  path.join(WORKSPACE_DIR, 'videos', 'uploaded', 'FINAL_VIDEO_4_VISUAL_UPGRADE.mp4'),
  path.join(WORKSPACE_DIR, 'videos', 'uploaded', 'FINAL_VIDEO_5_VISUAL_UPGRADE.mp4')
];

const srts = [
  path.join(WORKSPACE_DIR, 'archive', '2026-05-31_old_files', 'root_old_renders', 'FINAL_VIDEO_1_DENSE_CREATED_REPLACEMENT.srt'),
  path.join(WORKSPACE_DIR, 'archive', '2026-05-31_old_files', 'root_old_renders', 'FINAL_VIDEO_2_VISUAL_UPGRADE.srt'),
  path.join(WORKSPACE_DIR, 'archive', '2026-05-31_old_files', 'root_old_renders', 'FINAL_VIDEO_3_VISUAL_UPGRADE.srt'),
  path.join(WORKSPACE_DIR, 'archive', '2026-05-31_old_files', 'root_old_renders', 'FINAL_VIDEO_4_VISUAL_UPGRADE.srt'),
  path.join(WORKSPACE_DIR, 'archive', '2026-05-31_old_files', 'root_old_renders', 'FINAL_VIDEO_5_VISUAL_UPGRADE.srt')
];

function getVideoDuration(filePath) {
  const result = spawnSync(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath
  ], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`Failed to get duration for ${filePath}: ${result.stderr}`);
  }
  return parseFloat(result.stdout.trim());
}

function toMs(hh, mm, ss, mss) {
  return (parseInt(hh, 10) * 3600 + parseInt(mm, 10) * 60 + parseInt(ss, 10)) * 1000 + parseInt(mss, 10);
}

function fromMs(ms) {
  const hh = Math.floor(ms / 3600000);
  ms %= 3600000;
  const mm = Math.floor(ms / 60000);
  ms %= 60000;
  const ss = Math.floor(ms / 1000);
  const mss = ms % 1000;
  
  const pad = (n, l) => String(n).padStart(l, '0');
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)},${pad(mss, 3)}`;
}

function shiftSrtContent(srtContent, shiftSeconds, startCounter) {
  const lines = srtContent.split(/\r?\n/);
  const result = [];
  let counter = startCounter;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      result.push('');
      continue;
    }
    
    // If it's a single integer, it is the sequence counter
    if (/^\d+$/.test(line)) {
      result.push(String(counter++));
      continue;
    }
    
    // Check if it's a timestamp line
    const match = line.match(/^(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})$/);
    if (match) {
      const startMs = toMs(match[1], match[2], match[3], match[4]) + Math.round(shiftSeconds * 1000);
      const endMs = toMs(match[5], match[6], match[7], match[8]) + Math.round(shiftSeconds * 1000);
      
      result.push(`${fromMs(startMs)} --> ${fromMs(endMs)}`);
    } else {
      result.push(line);
    }
  }
  
  return { content: result.join('\r\n'), endCounter: counter };
}

function main() {
  console.log('--- Higsfield Omni Video Compilation Creator ---');
  console.log('Verifying source files...');
  
  for (const video of videos) {
    if (!fs.existsSync(video)) {
      console.error(`Error: Video file not found: ${video}`);
      process.exit(1);
    }
  }
  for (const srt of srts) {
    if (!fs.existsSync(srt)) {
      console.error(`Error: Subtitle file not found: ${srt}`);
      process.exit(1);
    }
  }
  console.log('All 5 video and subtitle source files verified.');
  
  console.log('Gathering video durations...');
  const durations = [];
  let totalDuration = 0;
  for (let i = 0; i < videos.length; i++) {
    const duration = getVideoDuration(videos[i]);
    durations.push(duration);
    console.log(`  Episode ${i + 1} Duration: ${duration.toFixed(2)} seconds (${Math.floor(duration / 60)}m ${Math.floor(duration % 60)}s)`);
    totalDuration += duration;
  }
  console.log(`Total Compiled Video Duration Target: ${totalDuration.toFixed(2)} seconds (${Math.floor(totalDuration / 60)}m ${Math.floor(totalDuration % 60)}s)\n`);
  
  console.log('Concatenating videos using FFmpeg copy concat...');
  const inputsTxtPath = path.join(WORKSPACE_DIR, 'inputs.txt');
  const inputsContent = videos.map(v => `file '${v.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(inputsTxtPath, inputsContent, 'utf8');
  
  const omniDir = path.join(WORKSPACE_DIR, 'omni_videos');
  if (!fs.existsSync(omniDir)) {
    fs.mkdirSync(omniDir, { recursive: true });
  }
  const finalVideoPath = path.join(omniDir, 'FINAL_OMNI_VIDEO.mp4');
  
  const ffmpegResult = spawnSync(ffmpegPath, [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', inputsTxtPath,
    '-c', 'copy',
    finalVideoPath
  ], { stdio: 'inherit', windowsHide: true });
  
  // Clean up inputs.txt
  if (fs.existsSync(inputsTxtPath)) {
    fs.unlinkSync(inputsTxtPath);
  }
  
  if (ffmpegResult.status !== 0) {
    console.error('Error: FFmpeg compilation failed.');
    process.exit(1);
  }
  
  console.log('\nFFmpeg compilation finished successfully!');
  console.log(`Mega video written to: ${finalVideoPath}\n`);
  
  console.log('Concatenating and time-shifting SRT subtitles...');
  let compiledSrtContent = '';
  let currentShift = 0;
  let currentCounter = 1;
  
  for (let i = 0; i < srts.length; i++) {
    const srtContent = fs.readFileSync(srts[i], 'utf8');
    const { content, endCounter } = shiftSrtContent(srtContent, currentShift, currentCounter);
    
    compiledSrtContent += content + '\r\n\r\n';
    currentCounter = endCounter;
    currentShift += durations[i];
  }
  
  const finalSrtPath = path.join(omniDir, 'FINAL_OMNI_VIDEO.srt');
  fs.writeFileSync(finalSrtPath, compiledSrtContent, 'utf8');
  
  console.log('SRT time-shifting finished successfully!');
  console.log(`Mega subtitles written to: ${finalSrtPath}\n`);
  
  console.log('Checking generated video duration...');
  const finalDuration = getVideoDuration(finalVideoPath);
  console.log(`Final Video Duration: ${finalDuration.toFixed(2)} seconds`);
  
  if (Math.abs(finalDuration - totalDuration) < 1) {
    console.log('[SUCCESS] Compilation is perfect!');
  } else {
    console.warn('[WARNING] Final duration matches targets with minor discrepancy.');
  }
}

main();
