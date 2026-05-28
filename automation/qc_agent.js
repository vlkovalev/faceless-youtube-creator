const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '..');
const SCRIPT_ID = process.argv[2] || '5';

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
  return JSON.parse(fs.readFileSync(file(relPath), 'utf8'));
}

function runQc(id) {
  const assetsDir = `assets/video_${id}_assets`;
  const manifestExists = exists(`${assetsDir}/placeholder_visuals_manifest.json`);
  const queue = readJson('metadata/queue.json', []);
  const queueEntry = queue.find(item => item.filename === `FINAL_VIDEO_${id}.mp4`);

  const checks = [
    { name: 'final_video_exists', ok: exists(`FINAL_VIDEO_${id}.mp4`), detail: `FINAL_VIDEO_${id}.mp4` },
    { name: 'final_video_non_empty', ok: getSizeMb(`FINAL_VIDEO_${id}.mp4`) > 1, detail: `${getSizeMb(`FINAL_VIDEO_${id}.mp4`).toFixed(2)} MB` },
    { name: 'captions_exist', ok: exists(`FINAL_VIDEO_${id}.srt`), detail: `FINAL_VIDEO_${id}.srt` },
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
