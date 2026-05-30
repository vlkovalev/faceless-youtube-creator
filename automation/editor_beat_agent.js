const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const WORKSPACE_DIR = path.join(__dirname, '..');
const LOCAL_FFMPEG = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');
const LOCAL_FFPROBE = path.join(__dirname, 'ffmpeg', 'bin', 'ffprobe.exe');

function findBinary(envName, binaryName) {
  const candidates = [process.env[envName], LOCAL_FFMPEG.replace('ffmpeg.exe', binaryName)].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  try { return execSync(`where ${binaryName}`, { encoding: 'utf8' }).split(/\r?\n/)[0].trim(); }
  catch { throw new Error(`Missing ${binaryName}`); }
}

const ffmpegPath = findBinary('FFMPEG_PATH', 'ffmpeg.exe');
const ffprobePath = findBinary('FFPROBE_PATH', 'ffprobe.exe');
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const SCRIPT_ID = process.argv[2] || '1';
const ASSETS_DIR = path.join(WORKSPACE_DIR, 'assets', `video_${SCRIPT_ID}_assets`);
const PLAN_PATH = path.join(ASSETS_DIR, 'visual_plan.json');
const OUTPUT_FILE = path.join(WORKSPACE_DIR, `FINAL_VIDEO_${SCRIPT_ID}_VISUAL_UPGRADE.mp4`);
const BGM_PATH = path.join(WORKSPACE_DIR, 'assets', 'bg_music_dark.mp3');
const DATA_PATH = path.join(WORKSPACE_DIR, 'scripts', `video_${SCRIPT_ID}_data.js`);

function parseScript() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const match = raw.match(new RegExp(`window\\.SCRIPTS\\[${SCRIPT_ID}\\]\\s*=\\s*(\\{[\\s\\S]+\\});`));
  if (!match) throw new Error(`Could not parse script ${SCRIPT_ID}`);
  return JSON.parse(match[1]);
}

function getAudioDuration(audioPath) {
  const out = execFileSync(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioPath], { encoding: 'utf8' });
  return parseFloat(out.trim());
}

function formatSrtTime(seconds) {
  const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600).toString().padStart(2, '0');
  const m = Math.floor((whole % 3600) / 60).toString().padStart(2, '0');
  const s = (whole % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s},${ms}`;
}

function safePathForConcat(filePath) {
  return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
}

function resolveAsset(assetFile, fallback) {
  const rel = assetFile || fallback;
  const p = path.join(WORKSPACE_DIR, rel.replace(/^assets[\\/]/, 'assets/'));
  if (fs.existsSync(p)) return p;
  const fallbackPath = path.join(ASSETS_DIR, fallback || 'scene_1_image.png');
  if (fs.existsSync(fallbackPath)) return fallbackPath;
  throw new Error(`Missing beat asset: ${assetFile}`);
}

function renderImageClip(imagePath, duration, outPath, zoomSeed) {
  return new Promise((resolve, reject) => {
    const frames = Math.max(30, Math.ceil(duration * 30));
    const zoom = zoomSeed % 2 === 0
      ? `zoompan=z='min(zoom+0.0009,1.18)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30`
      : `zoompan=z='1.12':d=${frames}:x='iw/2-(iw/zoom/2)+sin(on/35)*18':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30`;

    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop', '1', '-framerate', '30'])
      .complexFilter([`[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,${zoom},eq=contrast=1.08:saturation=0.82,format=yuv420p[v]`])
      .outputOptions(['-map [v]', '-c:v libx264', '-pix_fmt yuv420p', '-r 30', `-t ${duration.toFixed(3)}`])
      .save(outPath)
      .on('end', resolve)
      .on('error', reject);
  });
}

function concatClips(listPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .save(outputPath)
      .on('end', resolve)
      .on('error', reject);
  });
}

function muxScene(videoPath, audioPath, duration, outPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions(['-map 0:v', '-map 1:a', '-c:v copy', '-c:a aac', '-b:a 192k', '-ar 44100', '-ac 2', `-t ${duration.toFixed(3)}`])
      .save(outPath)
      .on('end', resolve)
      .on('error', reject);
  });
}

async function renderScene(scenePlan, scriptScene, sceneIndex) {
  const audioPath = path.join(ASSETS_DIR, `scene_${sceneIndex}_audio.wav`);
  if (!fs.existsSync(audioPath)) throw new Error(`Missing audio: ${audioPath}`);
  const audioDuration = getAudioDuration(audioPath);
  const beats = scenePlan.beats || [];
  const totalBeatDuration = beats.reduce((sum, beat) => sum + Number(beat.duration_s || 1), 0) || beats.length;
  const clipPaths = [];

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const duration = i === beats.length - 1
      ? Math.max(1, audioDuration - clipPaths.reduce((sum, clip) => sum + clip.duration, 0))
      : Math.max(1.2, audioDuration * (Number(beat.duration_s || 1) / totalBeatDuration));
    const imagePath = resolveAsset(beat.asset_file, beat.fallback || `scene_${sceneIndex}_image.png`);
    const outPath = path.join(ASSETS_DIR, `scene_${sceneIndex}_beat_${beat.beat_id}.mp4`);
    console.log(`Scene ${sceneIndex} beat ${beat.beat_id}: ${duration.toFixed(1)}s -> ${path.basename(imagePath)}`);
    await renderImageClip(imagePath, duration, outPath, i + sceneIndex);
    clipPaths.push({ path: outPath, duration });
  }

  const listPath = path.join(ASSETS_DIR, `scene_${sceneIndex}_beats_concat.txt`);
  fs.writeFileSync(listPath, clipPaths.map(clip => `file '${safePathForConcat(clip.path)}'`).join('\n'));
  const videoOnlyPath = path.join(ASSETS_DIR, `scene_${sceneIndex}_beats_video.mp4`);
  const sceneOutPath = path.join(ASSETS_DIR, `scene_${sceneIndex}_beat_temp.mp4`);
  await concatClips(listPath, videoOnlyPath);
  await muxScene(videoOnlyPath, audioPath, audioDuration, sceneOutPath);

  fs.unlinkSync(listPath);
  fs.unlinkSync(videoOnlyPath);
  for (const clip of clipPaths) fs.unlinkSync(clip.path);

  return { path: sceneOutPath, duration: audioDuration, text: scriptScene.voiceover.replace(/<[^>]*>?/gm, '') };
}

async function run() {
  if (!fs.existsSync(PLAN_PATH)) throw new Error(`Missing visual plan: ${PLAN_PATH}`);
  const script = parseScript();
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8').replace(/^\uFEFF/, ''));
  const tempScenes = [];
  let srt = '';
  let current = 0;

  console.log(`Starting beat-aware editor for Video ${SCRIPT_ID}`);
  for (let i = 0; i < plan.scenes.length; i++) {
    const sceneIndex = i + 1;
    const scene = await renderScene(plan.scenes[i], script.scenes[i], sceneIndex);
    tempScenes.push(scene.path);
    srt += `${sceneIndex}\n${formatSrtTime(current)} --> ${formatSrtTime(current + scene.duration)}\n${scene.text}\n\n`;
    current += scene.duration;
  }

  const srtPath = OUTPUT_FILE.replace('.mp4', '.srt');
  fs.writeFileSync(srtPath, srt);
  const concatPath = path.join(ASSETS_DIR, 'beat_master_concat.txt');
  fs.writeFileSync(concatPath, tempScenes.map(p => `file '${safePathForConcat(p)}'`).join('\n'));
  const tempMasterPath = path.join(ASSETS_DIR, 'beat_temp_master.mp4');
  await concatClips(concatPath, tempMasterPath);

  console.log('Adding background music and subtitles...');
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(tempMasterPath)
      .input(BGM_PATH)
      .inputOptions(['-stream_loop', '-1'])
      .input(srtPath)
      .complexFilter(['[1:a]aresample=44100,volume=0.25[bg]', '[0:a][bg]amix=inputs=2:duration=first[a]'])
      .outputOptions(['-map 0:v', '-map [a]', '-map 2:s', '-c:v copy', '-c:a aac', '-c:s mov_text', '-b:a 192k', `-t ${current.toFixed(3)}`])
      .save(OUTPUT_FILE)
      .on('end', resolve)
      .on('error', reject);
  });

  fs.unlinkSync(concatPath);
  fs.unlinkSync(tempMasterPath);
  for (const p of tempScenes) fs.unlinkSync(p);

  console.log(`[SUCCESS] Beat-aware visual upgrade exported: ${OUTPUT_FILE}`);
  console.log(`[SUCCESS] Captions exported: ${srtPath}`);
  console.log(`[INFO] Duration: ${current.toFixed(1)}s`);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});