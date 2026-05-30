const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_DIR = path.join(__dirname, '..');
const SCRIPT_ID = process.argv[2] || '5';
const LOCAL_FFPROBE = path.join(__dirname, 'ffmpeg', 'bin', 'ffprobe.exe');
const DEFAULT_FFPROBE = 'C:\\Users\\heliu\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffprobe.exe';
const MIN_LONG_FORM_SECONDS = 480;

function file(relPath) {
  return path.join(WORKSPACE_DIR, relPath);
}

function exists(relPath) {
  return fs.existsSync(file(relPath));
}

function getSizeMb(relPath) {
  if (!exists(relPath)) return 0;
  return fs.statSync(file(relPath)).size / (1024 * 1024);
}

function countFiles(dirRel, matcher) {
  const dir = file(dirRel);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(matcher).length;
}

function readJson(relPath, fallback) {
  if (!exists(relPath)) return fallback;
  return JSON.parse(fs.readFileSync(file(relPath), 'utf8').replace(/^\uFEFF/, ''));
}

function commandExists(command) {
  const result = spawnSync('where.exe', [command], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
}

function getFfprobePath() {
  return process.env.FFPROBE_PATH || (fs.existsSync(LOCAL_FFPROBE) ? LOCAL_FFPROBE : (fs.existsSync(DEFAULT_FFPROBE) ? DEFAULT_FFPROBE : commandExists('ffprobe')));
}

function getVideoDurationSeconds(relPath) {
  if (!exists(relPath)) return null;
  const ffprobePath = getFfprobePath();
  if (!ffprobePath) return null;
  const result = spawnSync(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file(relPath)
  ], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const seconds = Number.parseFloat(result.stdout.trim());
  return Number.isFinite(seconds) ? seconds : null;
}

function runQc(id) {
  const assetsDir = `assets/video_${id}_assets`;
  const manifestExists = exists(`${assetsDir}/placeholder_visuals_manifest.json`);
  const queue = readJson('metadata/queue.json', []);
  const finalVideo = exists(`FINAL_VIDEO_${id}_VISUAL_UPGRADE.mp4`)
    ? `FINAL_VIDEO_${id}_VISUAL_UPGRADE.mp4`
    : `FINAL_VIDEO_${id}.mp4`;
  const captions = exists(`FINAL_VIDEO_${id}_VISUAL_UPGRADE.srt`)
    ? `FINAL_VIDEO_${id}_VISUAL_UPGRADE.srt`
    : `FINAL_VIDEO_${id}.srt`;
  const queueEntry = queue.find(item => item.filename === finalVideo) || queue.find(item => item.filename === `FINAL_VIDEO_${id}.mp4`);
  const durationSeconds = getVideoDurationSeconds(finalVideo);

  const checks = [
    { name: 'final_video_exists', ok: exists(finalVideo), detail: finalVideo },
    { name: 'final_video_non_empty', ok: getSizeMb(finalVideo) > 1, detail: `${getSizeMb(finalVideo).toFixed(2)} MB` },
    { name: 'long_form_duration_minimum', ok: durationSeconds !== null && durationSeconds >= MIN_LONG_FORM_SECONDS, detail: durationSeconds === null ? 'unknown duration' : `${Math.round(durationSeconds)}s / ${MIN_LONG_FORM_SECONDS}s minimum` },
    { name: 'captions_exist', ok: exists(captions), detail: captions },
    { name: 'thumbnail_exists', ok: exists(id === '1' ? 'assets/youtube_thumbnail.png' : `assets/youtube_thumbnail_video_${id}.png`), detail: id === '1' ? 'assets/youtube_thumbnail.png' : `assets/youtube_thumbnail_video_${id}.png` },
    { name: 'scene_audio_count', ok: countFiles(assetsDir, name => /^scene_\d+_audio\.wav$/.test(name)) >= 12, detail: `${countFiles(assetsDir, name => /^scene_\d+_audio\.wav$/.test(name))}/12` },
    { name: 'scene_visual_count', ok: countFiles(assetsDir, name => /^scene_\d+_(image\.png|video\.mp4)$/.test(name)) >= 12, detail: `${countFiles(assetsDir, name => /^scene_\d+_(image\.png|video\.mp4)$/.test(name))}/12` },
    { name: 'metadata_queue_entry', ok: Boolean(queueEntry), detail: queueEntry ? queueEntry.title : 'missing queue entry' },
    { name: 'human_approval_enabled', ok: Boolean(queueEntry && queueEntry.human_approval), detail: queueEntry ? String(queueEntry.human_approval) : 'missing queue entry' }
  ];

  const warnings = [];
  if (manifestExists) {
    warnings.push('Placeholder visuals are present. This is acceptable for pipeline testing, but replace them before public publishing.');
  }

  const passed = checks.every(check => check.ok);
  const report = {
    video_id: `VID-${String(id).padStart(4, '0')}`,
    script_id: Number(id),
    qc_status: passed ? 'passed_with_warnings' : 'failed',
    generated_at: new Date().toISOString(),
    checks,
    warnings,
    approval_required_before_public: true
  };

  const logDir = file('metadata/qc_reports');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, `video_${id}_qc_report.json`), JSON.stringify(report, null, 2));

  console.log(`QC ${report.qc_status} for video ${id}`);
  for (const check of checks) {
    console.log(`${check.ok ? '[OK]' : '[FAIL]'} ${check.name}: ${check.detail}`);
  }
  for (const warning of warnings) {
    console.log(`[WARN] ${warning}`);
  }

  return report;
}

function main() {
  const report = runQc(SCRIPT_ID);
  if (report.qc_status === 'failed') process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { runQc };
