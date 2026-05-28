const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_DIR = path.join(__dirname, '..');
const LOCAL_FFMPEG = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');
const LOCAL_FFPROBE = path.join(__dirname, 'ffmpeg', 'bin', 'ffprobe.exe');
const DEFAULT_FFMPEG = 'C:\\Users\\heliu\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffmpeg.exe';
const DEFAULT_FFPROBE = 'C:\\Users\\heliu\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffprobe.exe';

const args = parseArgs(process.argv.slice(2));
const videoId = args.video || args.v || '4';
const stage = args.stage || 'check';

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    parsed[key] = value;
  }
  return parsed;
}

function exists(relPath) {
  return fs.existsSync(path.join(WORKSPACE_DIR, relPath));
}

function countFiles(dirRel, matcher) {
  const dir = path.join(WORKSPACE_DIR, dirRel);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(matcher).length;
}

function commandExists(command) {
  const result = spawnSync('where.exe', [command], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
}

function getQueue() {
  const queuePath = path.join(WORKSPACE_DIR, 'metadata', 'queue.json');
  if (!fs.existsSync(queuePath)) return [];
  return JSON.parse(fs.readFileSync(queuePath, 'utf8'));
}

function checkReadiness(id) {
  const assetsDir = `assets/video_${id}_assets`;
  const scriptPath = `scripts/video_${id}_data.js`;
  const thumbnailPath = id === '1' ? 'assets/youtube_thumbnail.png' : `assets/youtube_thumbnail_video_${id}.png`;
  const finalVideoPath = `FINAL_VIDEO_${id}.mp4`;
  const srtPath = `FINAL_VIDEO_${id}.srt`;
  const queue = getQueue();
  const queueEntry = queue.find(item => item.filename === `FINAL_VIDEO_${id}.mp4`);
  const ffmpegPath = process.env.FFMPEG_PATH || (fs.existsSync(LOCAL_FFMPEG) ? LOCAL_FFMPEG : (fs.existsSync(DEFAULT_FFMPEG) ? DEFAULT_FFMPEG : commandExists('ffmpeg')));
  const ffprobePath = process.env.FFPROBE_PATH || (fs.existsSync(LOCAL_FFPROBE) ? LOCAL_FFPROBE : (fs.existsSync(DEFAULT_FFPROBE) ? DEFAULT_FFPROBE : commandExists('ffprobe')));

  const report = [
    { check: 'Script data', ok: exists(scriptPath), detail: scriptPath },
    { check: 'Thumbnail', ok: exists(thumbnailPath), detail: thumbnailPath },
    { check: 'Piper executable', ok: exists('automation/piper_tts/piper/piper.exe'), detail: 'automation/piper_tts/piper/piper.exe' },
    { check: 'Piper voice model', ok: exists('automation/piper_tts/piper/voice.onnx'), detail: 'automation/piper_tts/piper/voice.onnx' },
    { check: 'FFmpeg', ok: Boolean(ffmpegPath), detail: ffmpegPath || 'missing: install ffmpeg or set FFMPEG_PATH' },
    { check: 'FFprobe', ok: Boolean(ffprobePath), detail: ffprobePath || 'missing: install ffprobe or set FFPROBE_PATH' },
    { check: 'Background music', ok: exists('assets/bg_music_dark.mp3'), detail: 'assets/bg_music_dark.mp3' },
    { check: 'Scene audio files', ok: countFiles(assetsDir, name => /^scene_\d+_audio\.wav$/.test(name)) >= 12, detail: `${countFiles(assetsDir, name => /^scene_\d+_audio\.wav$/.test(name))}/12 wav files` },
    { check: 'Scene visual files', ok: countFiles(assetsDir, name => /^scene_\d+_(image\.png|video\.mp4)$/.test(name)) >= 12, detail: `${countFiles(assetsDir, name => /^scene_\d+_(image\.png|video\.mp4)$/.test(name))}/12 visual files` },
    { check: 'Final video', ok: exists(finalVideoPath), detail: finalVideoPath },
    { check: 'Captions', ok: exists(srtPath), detail: srtPath },
    { check: 'Queue entry', ok: Boolean(queueEntry), detail: queueEntry ? 'metadata/queue.json' : `missing FINAL_VIDEO_${id}.mp4 entry` },
    { check: 'YouTube credentials', ok: exists('automation/credentials/client_secrets.json') && exists('automation/credentials/oauth_tokens.json'), detail: 'automation/credentials/' }
  ];

  return report;
}

function printReport(report) {
  console.log(`\nProduction readiness for video ${videoId}`);
  console.log('='.repeat(44));
  for (const item of report) {
    console.log(`${item.ok ? '[OK]   ' : '[BLOCK]'} ${item.check}: ${item.detail}`);
  }
  const blockers = report.filter(item => !item.ok);
  console.log('='.repeat(44));
  console.log(blockers.length ? `Blocked by ${blockers.length} item(s).` : 'Ready for all configured stages.');
  return blockers;
}

function runNodeScript(scriptName, id, extraArgs = []) {
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName), id, ...extraArgs], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: false
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  const report = checkReadiness(videoId);
  const blockers = printReport(report);

  if (stage === 'check') return;

  if (stage === 'voiceover') {
    const required = report.filter(item => ['Script data', 'Piper executable', 'Piper voice model'].includes(item.check) && !item.ok);
    if (required.length) process.exit(1);
    runNodeScript('generate_assets.js', videoId);
    return;
  }

  if (stage === 'edit') {
    const required = report.filter(item => ['Script data', 'FFmpeg', 'FFprobe', 'Background music', 'Scene audio files', 'Scene visual files'].includes(item.check) && !item.ok);
    if (required.length) process.exit(1);
    runNodeScript('editor_agent.js', videoId);
    return;
  }

  if (stage === 'visuals-fallback') {
    const required = report.filter(item => ['Script data'].includes(item.check) && !item.ok);
    if (required.length) process.exit(1);
    runNodeScript('create_placeholder_visuals.js', videoId);
    return;
  }

  if (stage === 'upload-dry-run') {
    const required = report.filter(item => ['Final video', 'Captions', 'Thumbnail', 'Queue entry', 'YouTube credentials'].includes(item.check) && !item.ok);
    if (required.length) process.exit(1);
    runNodeScript('uploader_agent.js', videoId, ['--dry-run']);
    return;
  }

  console.error(`Unknown stage: ${stage}`);
  console.error('Use --stage check, voiceover, visuals-fallback, edit, or upload-dry-run.');
  process.exit(1);
}

main();
