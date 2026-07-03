/**
 * Renders a Saints prayer companion from its rights-cleared script and local audio.
 * Documentary outputs are never read or overwritten.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT, SAINTS_ROOT } = require('./channel_paths');

const id = process.argv[2];
if (!id || !/^\d+$/.test(id)) throw new Error('Usage: node saints_prayer_renderer.js <video-id>');

const scriptPath = path.join(SAINTS_ROOT, 'scripts', `saints_video_${id}_prayer_data.js`);
const assetsDir = path.join(SAINTS_ROOT, 'assets', `saints_video_${id}_assets`);
const outputDir = path.join(SAINTS_ROOT, 'videos', 'saints_prayers_ready');
const workDir = path.join(assetsDir, '_prayer_render');
const ffmpeg = path.join(REPO_ROOT, 'automation', 'ffmpeg', 'bin', 'ffmpeg.exe');
const ffprobe = path.join(REPO_ROOT, 'automation', 'ffmpeg', 'bin', 'ffprobe.exe');

function run(exe, args) {
  const result = spawnSync(exe, args, { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error(`${path.basename(exe)} failed with exit code ${result.status}`);
}

function capture(exe, args) {
  const result = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || `${path.basename(exe)} failed`);
  return result.stdout.trim();
}

function loadScript() {
  const raw = fs.readFileSync(scriptPath, 'utf8').replace(/^\uFEFF/, '');
  const match = raw.match(new RegExp(`window\\.SAINTS_PRAYER_COMPANIONS\\[${id}\\]\\s*=\\s*(\\{[\\s\\S]+\\})\\s*;?\\s*$`));
  if (!match) throw new Error(`Could not parse prayer script ${scriptPath}`);
  const script = JSON.parse(match[1]);
  if (!script.rights_verified) throw new Error('Prayer script is not rights verified.');
  return script;
}

function audioDuration(file) {
  return Number(capture(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]));
}

function assTime(seconds) {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

function wrap(text, maxChars = 36) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line || `${line} ${word}`.length <= maxChars) line = line ? `${line} ${word}` : word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function pagesFor(text) {
  const lines = wrap(text);
  const pages = [];
  for (let i = 0; i < lines.length; i += 5) pages.push(lines.slice(i, i + 5).join('\\N'));
  return pages.length ? pages : [''];
}

function assEscape(text) {
  return text.replace(/([{}])/g, '\\$1');
}

function filterPath(file) {
  return file.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:').replace(/'/g, "\\'");
}

function findVerifiedIconCard() {
  const candidates = [
    'scene_1_image.png',
    'scene_1_beat_1a_image.png',
    'scene_1_beat_1_image.png'
  ];
  for (const name of candidates) {
    const file = path.join(assetsDir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function makeAss(section, duration, file) {
  const pages = pagesFor(section.screen_text);
  const pageDuration = duration / pages.length;
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Prayer,Arial,46,&H00F7F2E8,&H00F7F2E8,&H00100E0C,&H00100E0C,0,0,0,0,100,100,0,0,1,2,0,7,105,880,250,1\nStyle: Heading,Arial,30,&H00CDB36D,&H00CDB36D,&H00100E0C,&H00100E0C,1,0,0,0,100,100,1,0,1,1,0,7,105,900,125,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  let events = `Dialogue: 0,0:00:00.00,${assTime(duration)},Heading,,0,0,0,,${assEscape(section.title.toUpperCase())}\n`;
  pages.forEach((page, index) => {
    events += `Dialogue: 0,${assTime(index * pageDuration)},${assTime((index + 1) * pageDuration)},Prayer,,0,0,0,,${assEscape(page)}\n`;
  });
  fs.writeFileSync(file, header + events, 'utf8');
  return pages;
}

function main() {
  if (!fs.existsSync(ffmpeg) || !fs.existsSync(ffprobe)) throw new Error('Local FFmpeg tools are missing.');
  const script = loadScript();
  const icon = findVerifiedIconCard();
  if (!icon) throw new Error(`Missing verified icon card in ${assetsDir}`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  const segments = [];
  let cursor = 0;
  let srtIndex = 1;
  let srt = '';

  script.sections.forEach((section, index) => {
    const audio = path.join(assetsDir, `section_${section.section_id}_audio.wav`);
    if (!fs.existsSync(audio) || fs.statSync(audio).size === 0) throw new Error(`Missing prayer audio: ${audio}`);
    const duration = audioDuration(audio);
    const ass = path.join(workDir, `section_${index + 1}.ass`);
    const pages = makeAss(section, duration, ass);
    const segment = path.join(workDir, `section_${index + 1}.mp4`);
    const videoFilter = `scale=1920:1080,drawbox=x=0:y=0:w=1120:h=1080:color=0x09090b@1:t=fill,drawbox=x=0:y=1000:w=1920:h=80:color=0x09090b@1:t=fill,drawbox=x=84:y=92:w=680:h=5:color=0xcdb36d@1:t=fill,subtitles=filename='${filterPath(ass)}'`;
    run(ffmpeg, ['-y', '-loop', '1', '-framerate', '5', '-i', icon, '-i', audio, '-vf', videoFilter, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-crf', '18', '-r', '5', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', segment]);
    segments.push(segment);
    const pageDuration = duration / pages.length;
    pages.forEach((page, pageIndex) => {
      const plain = page.replace(/\\N/g, ' ');
      srt += `${srtIndex++}\n${srtTime(cursor + pageIndex * pageDuration)} --> ${srtTime(cursor + (pageIndex + 1) * pageDuration)}\n${plain}\n\n`;
    });
    cursor += duration;
  });

  const concat = path.join(workDir, 'concat.txt');
  fs.writeFileSync(concat, segments.map(file => `file '${file.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const outBase = `SAINTS_PRAYER_${id}_FINAL`;
  const mp4 = path.join(outputDir, `${outBase}.mp4`);
  const srtPath = path.join(outputDir, `${outBase}.srt`);
  run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', '-movflags', '+faststart', mp4]);
  fs.writeFileSync(srtPath, srt, 'utf8');
  const finalDuration = audioDuration(mp4);

  const report = {
    generated_at: new Date().toISOString(),
    companion_id: `saints_${id}_prayer`,
    title: script.video.title,
    rights_verified: true,
    icon_source: icon,
    sections: script.sections.length,
    duration_seconds: Number(finalDuration.toFixed(3)),
    output_mp4: mp4,
    output_srt: srtPath,
    ready_for_qc: true
  };
  fs.writeFileSync(path.join(SAINTS_ROOT, 'metadata', `saints_video_${id}_prayer_render_report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
