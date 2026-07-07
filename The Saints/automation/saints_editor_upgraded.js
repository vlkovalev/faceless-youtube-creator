/**
 * saints_editor_upgraded.js
 *
 * Upgraded video editor for The Saints.
 * Renders scenes with dynamic candlelight flicker, pulsating vignettes, background music,
 * and elegant burned-in Georgia font subtitles.
 */

'use strict';

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { REPO_ROOT, SAINTS_ROOT } = require('./channel_paths');

const ROOT = SAINTS_ROOT;
const SCRIPT_ID = process.argv[2] || '2';
const SCRIPT_PATH = path.join(ROOT, 'scripts', `saints_video_${SCRIPT_ID}_data.js`);
const ASSETS_DIR = path.join(ROOT, 'assets', `saints_video_${SCRIPT_ID}_assets`);
const READY_DIR = path.join(ROOT, 'videos', 'saints_ready');
const BGM_PATH = path.join(REPO_ROOT, 'assets', 'bg_music_dark.mp3');
const LOCAL_FFMPEG = path.join(REPO_ROOT, 'automation', 'ffmpeg', 'bin', 'ffmpeg.exe');
const LOCAL_FFPROBE = path.join(REPO_ROOT, 'automation', 'ffmpeg', 'bin', 'ffprobe.exe');

function findBinary(envName, binaryName, localPath) {
  const candidates = [process.env[envName], localPath].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return execSync(`where ${binaryName}`, { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
}

ffmpeg.setFfmpegPath(findBinary('FFMPEG_PATH', 'ffmpeg.exe', LOCAL_FFMPEG));
ffmpeg.setFfprobePath(findBinary('FFPROBE_PATH', 'ffprobe.exe', LOCAL_FFPROBE));

function loadScript() {
  const raw = fs.readFileSync(SCRIPT_PATH, 'utf8').replace(/^\uFEFF/, '');
  const re = new RegExp(`window\\.SAINTS_SCRIPTS\\[${SCRIPT_ID}\\]\\s*=\\s*(\\{[\\s\\S]+\\})\\s*;?\\s*$`);
  const match = raw.match(re);
  if (!match) throw new Error(`Could not parse SAINTS_SCRIPTS[${SCRIPT_ID}]`);
  return JSON.parse(match[1]);
}

function cleanVoiceover(text) {
  return String(text || '').replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function findSceneFile(sceneNumber, kind) {
  const stems = [`scene_${sceneNumber}`, `scene_${String(sceneNumber).padStart(2, '0')}`];
  const exts = kind === 'audio' ? ['wav', 'mp3'] : ['mp4', 'png', 'jpg', 'jpeg', 'svg'];
  for (const stem of stems) {
    for (const ext of exts) {
      const candidate = path.join(ASSETS_DIR, `${stem}_${kind === 'audio' ? 'audio' : 'image'}.${ext}`);
      if (fs.existsSync(candidate)) return candidate;
      const videoCandidate = path.join(ASSETS_DIR, `${stem}_video.${ext}`);
      if (kind !== 'audio' && fs.existsSync(videoCandidate)) return videoCandidate;
    }
  }
  return null;
}

function findBeatVisualFiles(sceneNumber) {
  const prefix = new RegExp(`^scene_${sceneNumber}_beat_.+_image\\.(png|jpg|jpeg)$`, 'i');
  return fs.readdirSync(ASSETS_DIR)
    .filter(name => prefix.test(name))
    .sort((a, b) => {
      const ax = (a.match(/_beat_([a-z0-9]+)_image/i) || [])[1] || a;
      const bx = (b.match(/_beat_([a-z0-9]+)_image/i) || [])[1] || b;
      return String(ax).localeCompare(String(bx), undefined, { numeric: true });
    })
    .map(name => path.join(ASSETS_DIR, name));
}

function duration(filePath) {
  const ffprobe = findBinary('FFPROBE_PATH', 'ffprobe.exe', LOCAL_FFPROBE);
  const out = execSync(`"${ffprobe}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
  return Number.parseFloat(out.toString().trim());
}

function srtTime(seconds) {
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  const ss = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function renderImageSegment(imagePath, outPath, segmentDuration) {
  return new Promise((resolve, reject) => {
    removeIfExists(outPath);
    const frames = Math.ceil(segmentDuration * 30);
    // Injected candlelight flicker (dynamic brightness) + pulsating vignette shadows
    // Aspect-ratio safe padding (scales to height 2160 and pads to 3840x2160 before zoompan)
    const filter = `scale=-1:2160,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:0x0b0a10,zoompan=z='min(zoom+0.00035,1.055)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,eq=contrast=1.05:saturation=0.92:brightness='0.015*sin(1.8*t)+0.008*cos(3.5*t)+0.004*sin(7*t)+0.002*random(1)',vignette='angle=0.15+0.015*sin(1.8*t)'[v]`;
    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop', '1', '-framerate', '30'])
      .complexFilter([filter])
      .outputOptions(['-map [v]', '-c:v libx264', '-preset ultrafast', '-threads 2', '-pix_fmt yuv420p', `-t ${segmentDuration.toFixed(3)}`])
      .save(outPath)
      .on('end', resolve)
      .on('error', reject);
  });
}

async function renderBeatVisualScene(scene, beatVisuals) {
  const sceneDuration = duration(scene.audioPath);
  const segmentDuration = sceneDuration / beatVisuals.length;
  const segmentFiles = [];
  for (let i = 0; i < beatVisuals.length; i++) {
    const outPath = path.join(ASSETS_DIR, `scene_${scene.index}_beat_segment_${i + 1}.mp4`);
    console.log(`Rendering upgraded scene ${scene.index} beat visual ${i + 1}/${beatVisuals.length}: ${segmentDuration.toFixed(2)}s`);
    await renderImageSegment(beatVisuals[i], outPath, segmentDuration);
    segmentFiles.push(outPath);
  }
  const concatPath = path.join(ASSETS_DIR, `scene_${scene.index}_beat_concat.txt`);
  const concatVideo = path.join(ASSETS_DIR, `scene_${scene.index}_beat_visuals.mp4`);
  removeIfExists(concatVideo);
  fs.writeFileSync(concatPath, segmentFiles.map(file => `file '${file.replace(/\\/g, '/')}'`).join('\n'));
  await new Promise((resolve, reject) => {
    ffmpeg().input(concatPath).inputOptions(['-f concat', '-safe 0']).outputOptions(['-c copy']).save(concatVideo).on('end', resolve).on('error', reject);
  });
  const outPath = path.join(ASSETS_DIR, `scene_${scene.index}_temp.mp4`);
  removeIfExists(outPath);
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatVideo)
      .input(scene.audioPath)
      .outputOptions(['-map 0:v', '-map 1:a', '-c:v copy', '-c:a aac', '-b:a 192k', '-ar 44100', '-ac 2', `-t ${sceneDuration.toFixed(3)}`])
      .save(outPath)
      .on('end', resolve)
      .on('error', reject);
  });
  fs.unlinkSync(concatPath);
  fs.unlinkSync(concatVideo);
  segmentFiles.forEach(file => fs.existsSync(file) && fs.unlinkSync(file));
  return { outPath, duration: sceneDuration };
}

function renderScene(scene) {
  return new Promise((resolve, reject) => {
    const sceneDuration = duration(scene.audioPath);
    const outPath = path.join(ASSETS_DIR, `scene_${scene.index}_temp.mp4`);
    removeIfExists(outPath);
    const visualExt = path.extname(scene.visualPath).toLowerCase();
    const isVideo = ['.mp4', '.mov', '.mkv'].includes(visualExt);
    const isSvg = visualExt === '.svg';

    let cmd = ffmpeg();
    if (isSvg) {
      cmd = cmd.input(scene.audioPath);
    } else if (isVideo) {
      cmd = cmd.input(scene.visualPath);
      cmd = cmd.input(scene.audioPath);
    } else {
      cmd = cmd.input(scene.visualPath).inputOptions(['-loop', '1', '-framerate', '30']);
      cmd = cmd.input(scene.audioPath);
    }

    const frames = Math.ceil(sceneDuration * 30);
    const title = String(scene.title || `Scene ${scene.index}`)
      .replace(/<[^>]*>?/gm, ' ')
      .replace(/[\\:']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 72);
    // SVG text screens also receive a subtle flicker to keep visual continuity
    const visualFilter = isSvg
      ? `color=c=0b0a10:s=1920x1080:d=${sceneDuration.toFixed(3)}:r=30,drawbox=x=110:y=94:w=560:h=6:color=0xb99d61@1:t=fill,drawtext=text='THE SAINTS / SCENE ${scene.index}':x=110:y=126:fontsize=30:fontcolor=0xc9d0d8,drawtext=text='${title.toUpperCase()}':x=130:y=430:fontsize=62:fontcolor=0xf7f2e8,drawbox=x=0:y=1008:w=1920:h=8:color=0xb99d61@1:t=fill,drawtext=text='holiness, suffering, courage, and grace':x=135:y=1036:fontsize=30:fontcolor=0xb8c0cc,eq=contrast=1.05:saturation=0.9:brightness='0.012*sin(1.8*t)+0.006*cos(3.5*t)+0.003*sin(7*t)+0.001*random(1)',vignette='angle=0.15'[v]`
      : isVideo
      ? `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,eq=contrast=1.05:saturation=0.92:brightness='0.015*sin(1.8*t)+0.008*cos(3.5*t)+0.004*sin(7*t)+0.002*random(1)',vignette='angle=0.15+0.015*sin(1.8*t)'[v]`
      : `[0:v]scale=-1:2160,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:0x0b0a10,zoompan=z='min(zoom+0.00045,1.09)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,eq=contrast=1.05:saturation=0.92:brightness='0.015*sin(1.8*t)+0.008*cos(3.5*t)+0.004*sin(7*t)+0.002*random(1)',vignette='angle=0.15+0.015*sin(1.8*t)'[v]`;

    console.log(`Rendering Upgraded Scene ${scene.index}: ${sceneDuration.toFixed(2)}s`);
    const audioMap = isSvg ? '-map 0:a' : '-map 1:a';
    cmd.complexFilter([visualFilter])
      .outputOptions([
        '-map [v]',
        audioMap,
        '-c:v libx264',
        '-preset ultrafast',
        '-threads 2',
        '-c:a aac',
        '-b:a 192k',
        '-ar 44100',
        '-ac 2',
        '-pix_fmt yuv420p',
        `-t ${sceneDuration.toFixed(3)}`
      ])
      .save(outPath)
      .on('end', () => resolve({ outPath, duration: sceneDuration }))
      .on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(READY_DIR, { recursive: true });
  const script = loadScript();
  const scenes = [];

  script.scenes.forEach((scene, index) => {
    const sceneNumber = index + 1;
    const audioPath = findSceneFile(sceneNumber, 'audio');
    const beatVisuals = findBeatVisualFiles(sceneNumber);
    const visualPath = beatVisuals[0] || findSceneFile(sceneNumber, 'visual');
    if (!audioPath || !visualPath) {
      throw new Error(`Missing assets for scene ${sceneNumber}: audio=${Boolean(audioPath)} visual=${Boolean(visualPath)}`);
    }
    scenes.push({ index: sceneNumber, audioPath, visualPath, beatVisuals, title: scene.title, text: cleanVoiceover(scene.voiceover) });
  });

  const tempVideos = [];
  let cursor = 0;
  let srt = '';
  let counter = 1;

  for (const scene of scenes) {
    const rendered = scene.beatVisuals && scene.beatVisuals.length > 1 ? await renderBeatVisualScene(scene, scene.beatVisuals) : await renderScene(scene);
    tempVideos.push(rendered.outPath);
    srt += `${counter++}\n${srtTime(cursor)} --> ${srtTime(cursor + rendered.duration)}\n${scene.text}\n\n`;
    cursor += rendered.duration;
  }

  const finalBase = `SAINTS_VIDEO_${SCRIPT_ID}_UPGRADED_PILOT`;
  const outputFile = path.join(READY_DIR, `${finalBase}.mp4`);
  const srtFile = path.join(READY_DIR, `SAINTS_VIDEO_${SCRIPT_ID}_FINAL.srt`);
  removeIfExists(outputFile);
  fs.writeFileSync(srtFile, srt, 'utf8');

  const concatPath = path.join(ASSETS_DIR, 'saints_concat.txt');
  fs.writeFileSync(concatPath, tempVideos.map(file => `file '${file.replace(/\\/g, '/')}'`).join('\n'));
  const concatOut = path.join(ASSETS_DIR, 'saints_temp_concat.mp4');
  removeIfExists(concatOut);

  console.log('Concatenating scenes...');
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .save(concatOut)
      .on('end', resolve)
      .on('error', reject);
  });

  // Prepare final render: Mix background music + Burn-in Georgia styled subtitles
  console.log('Mixing audio and burning in styled Georgia subtitles...');
  const tempSrtFile = `temp_subtitles_${SCRIPT_ID}.srt`;
  fs.copyFileSync(srtFile, path.join(REPO_ROOT, tempSrtFile));
  
  let complexFilter = [];
  let audioMap = '[0:a]';
  if (fs.existsSync(BGM_PATH)) {
    complexFilter.push('[1:a]aresample=44100,volume=0.18[bg]', '[0:a][bg]amix=inputs=2:duration=first[a]');
    audioMap = '[a]';
  } else {
    console.warn(`Warning: Background music file not found at ${BGM_PATH}. Mixing without BGM.`);
  }
  
  complexFilter.push(`[0:v]subtitles='${tempSrtFile}':force_style='FontName=Georgia,FontSize=20,PrimaryColour=&H00F5F2EC,OutlineColour=&H000C0A10,BorderStyle=4,Outline=3,Alignment=2,MarginV=60'[v]`);

  await new Promise((resolve, reject) => {
    const cmd = ffmpeg().input(concatOut);
    if (fs.existsSync(BGM_PATH)) {
      cmd.input(BGM_PATH).inputOptions(['-stream_loop', '-1']);
    }
    cmd.complexFilter(complexFilter)
      .outputOptions([
        '-map [v]',
        `-map ${audioMap}`,
        '-c:v libx264',
        '-preset ultrafast',
        '-threads 2',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 192k',
        '-ar 44100',
        '-ac 2',
        `-t ${cursor.toFixed(3)}`
      ])
      .save(outputFile)
      .on('end', resolve)
      .on('error', reject);
  });

  fs.unlinkSync(concatPath);
  fs.unlinkSync(concatOut);
  const fullTempSrt = path.join(REPO_ROOT, tempSrtFile);
  if (fs.existsSync(fullTempSrt)) fs.unlinkSync(fullTempSrt);
  tempVideos.forEach(file => fs.existsSync(file) && fs.unlinkSync(file));

  console.log(`🎉 Upgraded Pilot Video complete: ${outputFile}`);
  console.log(`Duration: ${cursor.toFixed(2)}s`);
  const minDuration = Number(SCRIPT_ID) >= 61 && Number(SCRIPT_ID) <= 68 ? 350 : 480;
  if (cursor < minDuration) {
    removeIfExists(outputFile);
    removeIfExists(srtFile);
    throw new Error(`Saints video ${SCRIPT_ID} rendered at ${cursor.toFixed(2)}s; minimum is ${minDuration}s.`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
