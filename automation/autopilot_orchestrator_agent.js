/**
 * autopilot_orchestrator_agent.js
 *
 * Coordinates the existing production agents instead of replacing them.
 *
 * Responsibilities:
 * - Detect completed Omni renders in omni_videos.
 * - Ensure queue metadata points at the exact completed MP4/SRT pair.
 * - Run release QC before upload.
 * - Optionally start uploader for one video.
 * - Run PM/growth/Saints planning agents when useful.
 * - Produce a structured action report for the PM heartbeat.
 *
 * Safe default: scan/report only. Use --upload to perform YouTube upload.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const META_DIR = path.join(ROOT, 'metadata');
const OMNI_DIR = path.join(ROOT, 'omni_videos');
const QUEUE_FILE = path.join(META_DIR, 'queue.json');
const TRACKER_FILE = path.join(META_DIR, 'uploads_tracker.json');
const NEXT_SLATE_FILE = path.join(META_DIR, 'next_slate.json');
const REPORT_FILE = path.join(META_DIR, 'autopilot_orchestrator_report.json');
const PLAYLIST_ID = 'PLNuBIVB7e5UoUFDds4rOK8dsfvK0T-Crn';

const args = parseArgs(process.argv.slice(2));
const upload = flagEnabled(args.upload);
const dryRun = flagEnabled(args['dry-run']);
const requestedVideo = args.video ? Number(args.video) : null;
const runSaints = flagEnabled(args.saints);
const runPm = args.pm !== 'false';
const runGrowth = flagEnabled(args.growth);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const keyValue = arg.slice(2).split('=');
    if (keyValue.length > 1) {
      out[keyValue[0]] = keyValue.slice(1).join('=');
    } else {
      const next = argv[i + 1];
      out[keyValue[0]] = next && !next.startsWith('--') ? argv[++i] : true;
    }
  }
  return out;
}

function flagEnabled(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function runAgent(script, agentArgs = [], options = {}) {
  let scriptPath = path.join(__dirname, script);
  if (!fs.existsSync(scriptPath)) {
    // Check in The Saints subproject automation directory
    const saintsPath = path.join(ROOT, 'The Saints', 'automation', script);
    if (fs.existsSync(saintsPath)) {
      scriptPath = saintsPath;
    }
  }
  const result = spawnSync(process.execPath, [scriptPath, ...agentArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
    shell: false,
    windowsHide: true
  });
  return {
    script,
    args: agentArgs,
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ? result.stdout.trim() : '',
    stderr: result.stderr ? result.stderr.trim() : ''
  };
}

function detectOmniVideos() {
  if (!fs.existsSync(OMNI_DIR)) return [];
  return fs.readdirSync(OMNI_DIR)
    .filter(name => /^FINAL_VIDEO_(\d+)_OMNI_FLASH\.mp4$/i.test(name))
    .map(name => {
      const videoNumber = Number(name.match(/^FINAL_VIDEO_(\d+)_OMNI_FLASH\.mp4$/i)[1]);
      const srt = name.replace(/\.mp4$/i, '.srt');
      const mp4Path = path.join(OMNI_DIR, name);
      const srtPath = path.join(OMNI_DIR, srt);
      return {
        video_number: videoNumber,
        filename: name,
        source_path: `omni_videos/${name}`,
        srt_filename: srt,
        srt_source_path: `omni_videos/${srt}`,
        mp4_exists: fs.existsSync(mp4Path),
        srt_exists: fs.existsSync(srtPath),
        size_mb: fs.statSync(mp4Path).size / (1024 * 1024),
        modified_at: fs.statSync(mp4Path).mtime.toISOString()
      };
    })
    .filter(item => !requestedVideo || item.video_number === requestedVideo)
    .sort((a, b) => a.video_number - b.video_number);
}

function getBaseQueueEntry(queue, videoNumber) {
  const candidates = [
    `FINAL_VIDEO_${videoNumber}_VISUAL_UPGRADE.mp4`,
    `FINAL_VIDEO_${videoNumber}_DENSE_CREATED_REPLACEMENT.mp4`,
    `FINAL_VIDEO_${videoNumber}.mp4`
  ];
  return [...queue].reverse().find(item => candidates.includes(item.filename))
    || queue.find(item => String(item.filename || '').startsWith(`FINAL_VIDEO_${videoNumber}`));
}

function targetPublishAt(videoNumber, base) {
  if (base && base.publish_at) return base.publish_at;
  const slate = readJson(NEXT_SLATE_FILE, {});
  const next = (slate.corporate_shadows || []).find(item => Number(item.script_id) === videoNumber);
  if (next && next.target_publish_at) return next.target_publish_at;
  return null;
}

function ensureQueueEntry(omni) {
  const queue = readJson(QUEUE_FILE, []);
  const base = getBaseQueueEntry(queue, omni.video_number);
  if (!base) {
    return { ok: false, reason: `No base queue entry found for video ${omni.video_number}` };
  }

  const entry = {
    ...base,
    filename: omni.filename,
    source_path: omni.source_path,
    srt_filename: omni.srt_filename,
    srt_source_path: omni.srt_source_path,
    status: 'scheduled',
    publish_time: '00:00',
    timezone: 'America/Edmonton',
    publish_at: targetPublishAt(omni.video_number, base),
    human_approval: false,
    replacement_for_uploaded_video: true,
    keep_existing_until_verified: true,
    visual_style: 'omni_flash',
    notes: `Omni Flash replacement registered by autopilot on ${new Date().toISOString()}. Upload new version first; keep existing scheduled upload until thumbnail/captions/playlist/schedule are verified.`
  };

  delete entry.delete_after_success_ids;
  delete entry.delete_after_success_mode;
  delete entry.delete_after_success_approved;
  delete entry.delete_after_success_completed_at;
  delete entry.delete_after_success_deleted_ids;

  const idx = queue.findIndex(item => item.filename === omni.filename);
  if (idx >= 0) queue[idx] = entry;
  else queue.push(entry);
  writeJson(QUEUE_FILE, queue);
  return { ok: true, entry };
}

function alreadyUploaded(filename) {
  const tracker = readJson(TRACKER_FILE, { uploaded_files: {} });
  return tracker.uploaded_files && tracker.uploaded_files[filename];
}

function extractUploadedId(uploadStdout) {
  const match = String(uploadStdout || '').match(/YouTube Video ID:\s*([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function processOmni(omni) {
  const result = {
    video_number: omni.video_number,
    filename: omni.filename,
    srt_exists: omni.srt_exists,
    size_mb: Number(omni.size_mb.toFixed(2)),
    queue: null,
    qc: null,
    upload: null,
    playlist: null,
    status: 'pending'
  };

  if (!omni.srt_exists) {
    result.status = 'blocked_missing_srt';
    return result;
  }

  const queued = ensureQueueEntry(omni);
  result.queue = queued;
  if (!queued.ok) {
    result.status = 'blocked_missing_queue_base';
    return result;
  }

  const qc = runAgent('uploader_agent.js', ['--dry-run', '--no-reserve-dry-run', `--only=${omni.filename}`, '--auto-approve-scheduled']);
  result.qc = { ok: qc.ok, stdout_tail: tail(qc.stdout), stderr_tail: tail(qc.stderr) };
  if (!qc.ok || /Release QC blocked/i.test(qc.stdout + qc.stderr)) {
    result.status = 'blocked_qc';
    return result;
  }

  const prior = alreadyUploaded(omni.filename);
  if (prior) {
    result.status = 'already_uploaded';
    result.upload = prior;
    return result;
  }

  if (!upload) {
    result.status = dryRun ? 'dry_run_ready' : 'ready_for_upload';
    return result;
  }

  const uploaded = runAgent('uploader_agent.js', [`--only=${omni.filename}`, '--auto-approve-scheduled']);
  result.upload = { ok: uploaded.ok, stdout_tail: tail(uploaded.stdout), stderr_tail: tail(uploaded.stderr) };
  if (!uploaded.ok) {
    result.status = 'upload_failed';
    return result;
  }

  const videoId = extractUploadedId(uploaded.stdout);
  if (videoId) {
    const playlist = runAgent('add_video_to_playlist.js', [videoId, PLAYLIST_ID]);
    result.playlist = { ok: playlist.ok, stdout_tail: tail(playlist.stdout), stderr_tail: tail(playlist.stderr), video_id: videoId };
  }
  result.status = 'uploaded_needs_studio_verification';
  return result;
}

function tail(text, max = 1600) {
  text = String(text || '');
  return text.length > max ? text.slice(text.length - max) : text;
}

function main() {
  const report = {
    generated_at: new Date().toISOString(),
    mode: { upload, dry_run: dryRun, requested_video: requestedVideo, run_saints: runSaints, run_pm: runPm, run_growth: runGrowth },
    omni_intake: [],
    agents_run: []
  };

  const omniVideos = detectOmniVideos();
  for (const omni of omniVideos) {
    report.omni_intake.push(processOmni(omni));
  }

  if (runPm) {
    const pm = runAgent('pm_agent.js');
    report.agents_run.push({ agent: 'pm_agent', ok: pm.ok, stdout_tail: tail(pm.stdout), stderr_tail: tail(pm.stderr) });
  }

  if (runGrowth) {
    const growth = runAgent('growth_agent.js');
    report.agents_run.push({ agent: 'growth_agent', ok: growth.ok, stdout_tail: tail(growth.stdout), stderr_tail: tail(growth.stderr) });
  }

  if (runSaints) {
    const saints = runAgent('saints_visual_asset_planner.js', ['--video', '13,14']);
    report.agents_run.push({ agent: 'saints_visual_asset_planner', ok: saints.ok, stdout_tail: tail(saints.stdout), stderr_tail: tail(saints.stderr) });
  }

  writeJson(REPORT_FILE, report);
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main();
}
