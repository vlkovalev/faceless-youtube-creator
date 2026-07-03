/**
 * saints_full_autopilot_agent.js
 *
 * Runs the safe Saints production path for the next eligible video:
 * status/PM -> local audio -> clean beat cards -> local render -> queue entry
 * -> thumbnail -> QC dry-run -> private draft upload.
 *
 * Safety boundaries:
 * - never deletes files or YouTube videos
 * - never publishes publicly
 * - never spends money or invokes paid generation
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT, SAINTS_ROOT } = require('./channel_paths');

const ROOT = SAINTS_ROOT;
const SHARED_ROOT = REPO_ROOT;
const NODE = process.execPath;
const args = process.argv.slice(2);
const uploadPrivate = args.includes('--upload-private');
const explicitVideo = (args.find(a => a.startsWith('--video=')) || '').split('=')[1];

function run(command, commandArgs = [], options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || SHARED_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_PATH: [
        path.join(SHARED_ROOT, 'automation', 'node_modules'),
        process.env.NODE_PATH
      ].filter(Boolean).join(path.delimiter)
    },
    timeout: options.timeout || 1200000,
    windowsHide: true
  });
  const item = {
    command: [path.basename(command), ...commandArgs].join(' '),
    status: result.status,
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
  console.log(`\n--- ${item.command} ---`);
  if (item.stdout.trim()) console.log(item.stdout.trim());
  if (item.stderr.trim()) console.error(item.stderr.trim());
  return item;
}

function readJson(rel, fallback) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function nextVideoId() {
  if (explicitVideo) return explicitVideo;
  const report = readJson('metadata/saints_pm_report.json', {});
  const action = (report.actions || []).find(a => a.type === 'next_production');
  const match = String(action?.action || '').match(/Saints video (\d+)/i);
  return match ? match[1] : null;
}

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function main() {
  const report = {
    generated_at: new Date().toISOString(),
    mode: uploadPrivate ? 'build_and_private_upload' : 'build_and_qc_only',
    safety: {
      public_publish: false,
      delete: false,
      paid_generation: false
    },
    runs: [],
    result: 'started'
  };

  report.runs.push(run(NODE, [path.join(SHARED_ROOT, 'automation', 'youtube_status_agent.js'), '--channel=saints']));
  report.runs.push(run(NODE, [path.join(ROOT, 'automation', 'saints_pm_push_agent.js')]));

  const id = nextVideoId();
  report.video_id = id;
  if (!id) {
    report.result = 'blocked_no_next_video';
    return finish(report);
  }

  report.runs.push(run(NODE, [path.join(ROOT, 'automation', 'saints_generate_assets.js'), id]));

  const planPath = path.join(ROOT, 'assets', `saints_video_${id}_assets`, 'visual_plan.json');
  if (!fs.existsSync(planPath)) {
    report.runs.push(run(NODE, [path.join(ROOT, 'automation', 'saints_visual_asset_planner.js'), '--video', id]));
  }

  report.runs.push(run(NODE, [path.join(ROOT, 'automation', 'saints_visual_plan_sync_agent.js'), id]));
  report.runs.push(run(NODE, [path.join(ROOT, 'automation', 'saints_verified_visual_injector_all.js'), id]));
  report.runs.push(run('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'automation', 'saints_visual_polish_agent.ps1'), id]));
  report.runs.push(run(NODE, [path.join(ROOT, 'automation', 'saints_editor_agent.js'), id]));
  report.runs.push(run(NODE, [path.join(ROOT, 'automation', 'saints_queue_entry_agent.js'), id]));
  report.runs.push(run('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'automation', 'saints_thumbnail_agent.ps1'), id]));

  const filename = `SAINTS_VIDEO_${id}_FINAL.mp4`;
  const dryRun = run(NODE, [
    path.join(SHARED_ROOT, 'automation', 'uploader_agent.js'),
    '--channel=saints',
    `--only=${filename}`,
    '--privacy=private',
    '--dry-run',
    '--no-reserve-dry-run'
  ]);
  report.runs.push(dryRun);

  if (!dryRun.stdout.includes('Release QC passed')) {
    report.result = 'blocked_qc_failed';
    report.blocker = 'QC did not pass; inspect metadata/qc_reports and uploader output.';
    return finish(report);
  }

  if (uploadPrivate) {
    const upload = run(NODE, [
      path.join(SHARED_ROOT, 'automation', 'uploader_agent.js'),
      '--channel=saints',
      `--only=${filename}`,
      '--privacy=private',
      '--auto-approve-private'
    ]);
    report.runs.push(upload);
    if (upload.ok) {
      const cleanup = run(NODE, [
        path.join(SHARED_ROOT, 'automation', 'youtube_duplicate_cleaner.js'),
        '--channel=saints'
      ]);
      report.runs.push(cleanup);
    }
    report.result = upload.ok ? 'uploaded_private_or_completed_with_thumbnail_warning' : 'blocked_upload_failed';
  } else {
    report.result = 'qc_passed_ready_for_private_upload';
  }

  report.runs.push(run(NODE, [path.join(SHARED_ROOT, 'automation', 'youtube_status_agent.js'), '--channel=saints']));
  report.runs.push(run(NODE, [path.join(ROOT, 'automation', 'saints_pm_push_agent.js')]));
  finish(report);
}

function finish(report) {
  const out = path.join(ROOT, 'metadata', 'saints_full_autopilot_report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nAutopilot result: ${report.result}`);
  console.log(`Report: ${out}`);
  if (String(report.result).startsWith('blocked')) process.exitCode = 1;
}

main();
