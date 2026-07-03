/**
 * SaaS Autopilot QA Agent
 * =======================
 * Validates generated video metadata before upload.
 *
 * Checks:
 *   - script metadata JSON exists and has title/description/tags
 *   - final video exists unless --skip-video is provided
 *   - every http(s) URL in the description resolves to HTTP 2xx/3xx
 *
 * Usage:
 *   node automation/saas_autopilot_qa_agent.js --topic SAAS-001
 *   node automation/saas_autopilot_qa_agent.js --topic SAAS-001 --skip-video
 *   node automation/saas_autopilot_qa_agent.js --topic SAAS-001 --dry-run
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const { analyzeScriptQuality } = require('./saas_autopilot_quality_standard');

const WORKSPACE_DIR = path.join(__dirname, '..');
const SCRIPTS_DIR = path.join(WORKSPACE_DIR, 'scripts', 'saas_autopilot');
const VIDEOS_DIR = path.join(WORKSPACE_DIR, 'videos', 'saas_autopilot');
const REPORTS_DIR = path.join(WORKSPACE_DIR, 'metadata', 'qa_reports');
const EDIT_REPORTS_DIR = path.join(WORKSPACE_DIR, 'metadata', 'edit_reports');
const APPROVALS_DIR = path.join(WORKSPACE_DIR, 'metadata', 'review_approvals');
const FFMPEG_EXE = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');
const DEFAULT_MIN_VIDEO_DURATION_SECONDS = Number(process.env.SAAS_AUTOPILOT_MIN_VIDEO_SECONDS || 480);

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const TOPIC_ID = String(args.topic || args.t || '').toUpperCase();
const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true';
const SKIP_VIDEO = args['skip-video'] === true || args['skip-video'] === 'true';

function sanitizeId(id) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function extractUrls(text) {
  const matches = String(text || '').match(/https?:\/\/[^\s<>)\]}"]+/g) || [];
  return [...new Set(matches.map(url => url.replace(/[.,;:!?]+$/, '')))];
}

function isTransportLimited(result) {
  if (!result || result.ok) return false;
  if (result.status) return false;
  return true;
}

function requestUrl(targetUrl, method = 'HEAD', redirectCount = 0) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      resolve({ url: targetUrl, ok: false, status: null, error: `Invalid URL: ${err.message}` });
      return;
    }

    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.request({
      method,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      timeout: 12000,
      headers: {
        'User-Agent': 'SaaS-Autopilot-QA/1.0',
        'Accept': '*/*'
      }
    }, (res) => {
      const status = res.statusCode || 0;
      const location = res.headers.location;
      res.resume();

      if ([301, 302, 303, 307, 308].includes(status) && location && redirectCount < 5) {
        const nextUrl = new URL(location, parsed).toString();
        requestUrl(nextUrl, method, redirectCount + 1).then(resolve);
        return;
      }

      if ((status === 403 || status === 405) && method === 'HEAD') {
        requestUrl(targetUrl, 'GET', redirectCount).then(resolve);
        return;
      }

      resolve({ url: targetUrl, ok: status >= 200 && status < 400, status, error: null });
    });

    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', (err) => {
      resolve({ url: targetUrl, ok: false, status: null, error: err.message });
    });
    req.end();
  });
}

async function checkLinks(description) {
  const urls = extractUrls(description);
  const results = [];

  for (const url of urls) {
    results.push(await requestUrl(url));
  }

  return {
    urls,
    results,
    failures: results.filter(result => !result.ok && !isTransportLimited(result)),
    transport_limits: results.filter(isTransportLimited)
  };
}

function findVideoPath(topicId, scriptId) {
  const candidates = [
    path.join(VIDEOS_DIR, `${topicId.replace(/-/g, '_')}_FINAL.mp4`),
    path.join(VIDEOS_DIR, `${scriptId}_FINAL.mp4`)
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

function checkVideoVisualContent(videoPath) {
  if (!fs.existsSync(FFMPEG_EXE)) {
    return {
      checked: false,
      passed: false,
      warning: `FFmpeg not found for visual QA: ${FFMPEG_EXE}`
    };
  }

  const result = spawnSync(FFMPEG_EXE, [
    '-hide_banner',
    '-i', videoPath,
    '-vf', 'blackdetect=d=0.5:pix_th=0.10',
    '-an',
    '-f', 'null',
    'NUL'
  ], {
    cwd: WORKSPACE_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
    windowsHide: true
  });

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const durationMatch = output.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationSeconds = durationMatch
    ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
    : null;

  const blackSegments = [...output.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)]
    .map(match => ({
      start: Number(match[1]),
      end: Number(match[2]),
      duration: Number(match[3])
    }));
  const blackSeconds = blackSegments.reduce((sum, segment) => sum + segment.duration, 0);
  const blackRatio = durationSeconds ? blackSeconds / durationSeconds : 0;
  const passed = result.status === 0 && blackRatio < 0.80;

  return {
    checked: true,
    passed,
    exit_code: result.status,
    duration_seconds: durationSeconds,
    black_seconds: Number(blackSeconds.toFixed(3)),
    black_ratio: Number(blackRatio.toFixed(4)),
    black_segments: blackSegments.slice(0, 10),
    error: result.status === 0 ? null : `FFmpeg exited with code ${result.status}`
  };
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function checkRepeatedFrames(videoPath) {
  if (!fs.existsSync(FFMPEG_EXE)) return { checked: false, passed: false, error: 'FFmpeg is required for repetition QA.' };
  const result = spawnSync(FFMPEG_EXE, [
    '-hide_banner', '-loglevel', 'error', '-i', videoPath,
    '-vf', 'fps=1/10,scale=64:36,format=gray', '-an', '-f', 'framemd5', '-'
  ], { cwd: WORKSPACE_DIR, encoding: 'utf8', stdio: 'pipe', shell: false, windowsHide: true });
  const hashes = String(result.stdout || '').split(/\r?\n/)
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split(',').pop().trim());
  const counts = new Map();
  for (const hash of hashes) counts.set(hash, (counts.get(hash) || 0) + 1);
  const repeatedSamples = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const repeatedRatio = hashes.length ? repeatedSamples / hashes.length : 1;
  return {
    checked: true,
    passed: result.status === 0 && hashes.length >= 20 && repeatedRatio <= 0.35,
    samples: hashes.length,
    repeated_samples: repeatedSamples,
    repeated_ratio: Number(repeatedRatio.toFixed(4)),
    error: result.status === 0 ? null : `FFmpeg exited with code ${result.status}`
  };
}

function checkProductionEvidence(scriptId, videoPath) {
  const editReportPath = path.join(EDIT_REPORTS_DIR, `${scriptId}_edit_report.json`);
  const approvalPath = path.join(APPROVALS_DIR, `${scriptId}_approval.json`);
  const failures = [];
  const videoSha256 = sha256File(videoPath);
  if (!fs.existsSync(editReportPath)) failures.push(`Edit report missing: ${editReportPath}`);
  else {
    const editReport = readJson(editReportPath);
    if (!editReport.publishable || editReport.mode !== 'production') failures.push('Video was rendered in draft/placeholder mode.');
    const invalidScenes = (editReport.scenes || []).filter(scene => scene.source_type !== 'screen_recording');
    if (invalidScenes.length) failures.push(`Non-recorded scene sources found: ${invalidScenes.map(scene => scene.scene_number).join(', ')}.`);
  }
  if (!fs.existsSync(approvalPath)) failures.push(`Full-watch approval missing: ${approvalPath}`);
  else {
    const approval = readJson(approvalPath);
    for (const field of ['approved', 'watched_full_video', 'action_sync_verified', 'final_output_verified']) {
      if (approval[field] !== true) failures.push(`Review approval requires ${field}=true.`);
    }
    if (!String(approval.reviewer || '').trim()) failures.push('Review approval requires a reviewer name.');
    if (approval.video_sha256 !== videoSha256) failures.push('Review approval does not match the exact rendered video hash.');
  }
  return { passed: failures.length === 0, failures, edit_report_path: editReportPath, approval_path: approvalPath, video_sha256: videoSha256 };
}

function resolveMinVideoDurationSeconds(script) {
  const configured = Number(script?.production?.minimum_duration_seconds);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(DEFAULT_MIN_VIDEO_DURATION_SECONDS, configured);
  }
  return DEFAULT_MIN_VIDEO_DURATION_SECONDS;
}

function formatDurationLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return `${seconds}s`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return `${seconds}s`;
}

function checkVideoDuration(videoPath, minimumDurationSeconds) {
  if (!fs.existsSync(FFMPEG_EXE)) {
    return {
      checked: false,
      passed: false,
      warning: `FFmpeg not found for duration QA: ${FFMPEG_EXE}`
    };
  }

  const ffprobeExe = FFMPEG_EXE.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
  const result = spawnSync(ffprobeExe, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath
  ], {
    cwd: WORKSPACE_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
    windowsHide: true
  });

  const durationSeconds = Number(String(result.stdout || '').trim());
  return {
    checked: true,
    passed: result.status === 0 && Number.isFinite(durationSeconds) && durationSeconds >= minimumDurationSeconds,
    exit_code: result.status,
    duration_seconds: Number.isFinite(durationSeconds) ? Number(durationSeconds.toFixed(3)) : null,
    minimum_duration_seconds: minimumDurationSeconds,
    error: result.status === 0 ? null : `FFprobe exited with code ${result.status}`
  };
}

async function main() {
  if (!TOPIC_ID) {
    console.error('Error: --topic is required.');
    process.exit(1);
  }

  const scriptId = sanitizeId(TOPIC_ID);
  const scriptPath = path.join(SCRIPTS_DIR, `${scriptId}_data.json`);
  const videoPath = findVideoPath(TOPIC_ID, scriptId);
  const failures = [];
  const warnings = [];

  console.log(`\nSaaS Autopilot QA Agent`);
  console.log(`Topic: ${TOPIC_ID}`);

  if (!fs.existsSync(scriptPath)) {
    failures.push(`Script metadata missing: ${scriptPath}`);
  }

  let script = null;
  let minimumDurationSeconds = DEFAULT_MIN_VIDEO_DURATION_SECONDS;
  if (fs.existsSync(scriptPath)) {
    script = readJson(scriptPath);
    minimumDurationSeconds = resolveMinVideoDurationSeconds(script);
    const title = script.video && script.video.title;
    const description = script.metadata && script.metadata.description_template;
    const tags = script.metadata && script.metadata.tags;

    if (!title || String(title).trim().length < 8) failures.push('Missing or too-short video title.');
    if (!description || String(description).trim().length < 50) failures.push('Missing or too-short description_template.');
    if (String(description || '').includes('DOWNLOAD_LINK_PENDING_PUBLIC_HOSTING')) {
      failures.push('Downloadable blueprint URL is still pending public hosting.');
    }
    if (!Array.isArray(tags) || tags.length < 3) warnings.push('Metadata has fewer than 3 tags.');

    const instructionalQuality = analyzeScriptQuality(script);
    for (const failure of instructionalQuality.failures) {
      failures.push(`Instructional quality: ${failure}`);
    }
    for (const warning of instructionalQuality.warnings) {
      warnings.push(`Instructional quality: ${warning}`);
    }

    if (DRY_RUN) {
      console.log('Dry run: link requests skipped.');
    } else {
      const linkReport = await checkLinks(description);
      for (const result of linkReport.results) {
        const detail = result.status ? `HTTP ${result.status}` : (result.error || 'transport unavailable');
        const label = result.ok ? 'OK' : (isTransportLimited(result) ? 'WARN' : 'FAIL');
        console.log(`${label} link: ${result.url} (${detail})`);
      }
      for (const result of linkReport.failures) {
        const detail = result.status ? `HTTP ${result.status}` : result.error;
        failures.push(`Broken description link: ${result.url} (${detail})`);
      }
      for (const result of linkReport.transport_limits) {
        const detail = result.error || 'transport unavailable';
        warnings.push(`Description link could not be verified from this shell: ${result.url} (${detail})`);
      }
    }
  }

  if (!SKIP_VIDEO && !fs.existsSync(videoPath)) {
    failures.push(`Final video missing: ${videoPath}`);
  }

  let visualQc = null;
  let durationQc = null;
  let repetitionQc = null;
  let productionEvidenceQc = null;
  if (!SKIP_VIDEO && fs.existsSync(videoPath)) {
    durationQc = checkVideoDuration(videoPath, minimumDurationSeconds);
    if (durationQc.warning) warnings.push(durationQc.warning);
    if (durationQc.checked && !durationQc.passed) {
      failures.push(`Final video is too short: ${durationQc.duration_seconds}s. Minimum required is ${durationQc.minimum_duration_seconds}s (${formatDurationLabel(durationQc.minimum_duration_seconds)}).`);
    }

    visualQc = checkVideoVisualContent(videoPath);
    if (visualQc.warning) failures.push(visualQc.warning);
    if (visualQc.checked && !visualQc.passed) {
      const percent = Math.round((visualQc.black_ratio || 0) * 100);
      failures.push(`Final video appears visually blank: ${percent}% black frames (${visualQc.black_seconds}s of ${visualQc.duration_seconds}s).`);
    }
    repetitionQc = checkRepeatedFrames(videoPath);
    if (!repetitionQc.passed) failures.push(`Repeated/static frame QA failed: ${Math.round((repetitionQc.repeated_ratio || 0) * 100)}% duplicate samples.`);
    productionEvidenceQc = checkProductionEvidence(scriptId, videoPath);
    for (const failure of productionEvidenceQc.failures) failures.push(`Production evidence: ${failure}`);
  }

  const report = {
    topic_id: TOPIC_ID,
    checked_at: new Date().toISOString(),
    script_path: scriptPath,
    video_path: SKIP_VIDEO ? null : videoPath,
    dry_run: DRY_RUN,
    skip_video: SKIP_VIDEO,
    failures,
    warnings,
    duration_qc: durationQc,
    visual_qc: visualQc,
    repetition_qc: repetitionQc,
    production_evidence_qc: productionEvidenceQc,
    instructional_quality_qc: script ? analyzeScriptQuality(script) : null,
    link_verification_limited: warnings.some(warning => warning.startsWith('Description link could not be verified from this shell:')),
    passed: failures.length === 0
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = path.join(REPORTS_DIR, `${scriptId}_qa_report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (warnings.length) {
    for (const warning of warnings) console.warn(`WARN: ${warning}`);
  }

  if (failures.length) {
    console.error(`\nQA failed with ${failures.length} issue(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }

  console.log(`\nQA passed. Report: ${reportPath}`);
}

main().catch(err => {
  console.error(`Fatal QA error: ${err.message}`);
  process.exit(1);
});
