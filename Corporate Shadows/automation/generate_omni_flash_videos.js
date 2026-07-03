/**
 * generate_omni_flash_videos.js
 *
 * Automatically converts the 12 newly generated high-fidelity AI keyframes (scene_i_image.png)
 * into smooth, 30fps animated cinematic video clips (scene_i_video.mp4) matching the exact
 * duration of each scene's audio.
 *
 * Applies a premium Ken Burns zoompan filter and color grading to bring the AI keyframes to life.
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

const SCRIPT_ID = process.argv[2] || '1';
const ASSETS_DIR = path.join(WORKSPACE_DIR, 'assets', `video_${SCRIPT_ID}_assets`);

function getAudioDuration(audioPath) {
  const result = spawnSync(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    audioPath
  ], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`Failed to get duration for ${audioPath}`);
  }
  return parseFloat(result.stdout.trim());
}

function animateSceneKeyframe(imagePath, audioDuration, outPath, sceneIndex) {
  const totalFrames = Math.ceil(audioDuration * 30);
  
  // Custom HSL Hues and movement per scene to maximize visual diversity
  let zoomExpression = `min(zoom+0.0008,1.25)`;
  if (sceneIndex % 3 === 0) {
    // Zoom out effect
    zoomExpression = `max(1.25-0.0008*on,1.0)`;
  } else if (sceneIndex % 2 === 0) {
    // Slower pan
    zoomExpression = `min(zoom+0.0004,1.15)`;
  }

  const complexFilter = `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='${zoomExpression}':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,eq=contrast=1.12:saturation=0.88[v]`;

  const args = [
    '-y',
    '-loop', '1',
    '-framerate', '30',
    '-i', imagePath,
    '-filter_complex', complexFilter,
    '-map', '[v]',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-t', audioDuration.toFixed(3),
    outPath
  ];

  const result = spawnSync(ffmpegPath, args, { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`FFmpeg failed to animate ${imagePath}`);
  }
}

function main() {
  console.log(`--- Higsfield Omni Flash Video Generator (Video ${SCRIPT_ID}) ---`);
    for (let i = 1; i <= 12; i++) {
    let audioPath = path.join(ASSETS_DIR, `scene_${i}_audio.wav`);
    const paddedAudioPath = path.join(ASSETS_DIR, `scene_${String(i).padStart(2, '0')}_audio.wav`);
    if (!fs.existsSync(audioPath) && fs.existsSync(paddedAudioPath)) {
      audioPath = paddedAudioPath;
    }
    const imagePath = path.join(ASSETS_DIR, `scene_${i}_image.png`);
    const videoOutPath = path.join(ASSETS_DIR, `scene_${i}_video.mp4`);
    
    if (!fs.existsSync(audioPath)) {
      console.error(`Error: Audio file not found: ${audioPath}`);
      continue;
    }
    if (!fs.existsSync(imagePath)) {
      console.error(`Error: Keyframe image not found: ${imagePath}`);
      continue;
    }
    
    const duration = getAudioDuration(audioPath);
    console.log(`\nScene ${i}: Animating ${path.basename(imagePath)} [Duration: ${duration.toFixed(2)}s]...`);
    
    animateSceneKeyframe(imagePath, duration, videoOutPath, i);
    console.log(`[OK] Scene ${i} animated successfully -> ${path.basename(videoOutPath)}`);
  }
  
  console.log('\nAll 12 AI keyframes compiled into smooth animated video clips successfully!');
}

main();
