/**
 * SaaS Autopilot Hold Failed Visual QC Agent
 * ==========================================
 * Finds scheduled SaaS Autopilot uploads whose local final video is visually
 * blank, then keeps the YouTube video private and clears the publish schedule.
 *
 * Usage:
 *   node automation/saas_autopilot_hold_failed_visual_qc_agent.js --dry-run
 *   node automation/saas_autopilot_hold_failed_visual_qc_agent.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const WORKSPACE_DIR = path.join(__dirname, '..');
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const VIDEOS_DIR = path.join(WORKSPACE_DIR, 'videos', 'saas_autopilot');
const METADATA_DIR = path.join(WORKSPACE_DIR, 'metadata');
const REPORTS_DIR = path.join(METADATA_DIR, 'qa_reports');
const FFMPEG_EXE = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');

const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_oauth_token.json');
const TRACKER_FILE = path.join(METADATA_DIR, 'uploads_tracker.json');
const EXPECTED_CHANNEL_TITLE = process.env.SAAS_AUTOPILOT_YOUTUBE_CHANNEL_TITLE || 'SaaS Autopilot';
const EXPECTED_CHANNEL_ID = process.env.SAAS_AUTOPILOT_YOUTUBE_CHANNEL_ID || '';
const BLACK_RATIO_HOLD_THRESHOLD = 0.80;

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true';

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function topicFromFileName(fileName) {
  return path.basename(fileName, '_FINAL.mp4').replace(/_/g, '-');
}

function trackerRows(tracker) {
  return Object.entries(tracker.uploaded_files || {})
    .filter(([, row]) => row && row.channel === 'saas_autopilot' && row.canonical && row.youtube_id && row.publish_at)
    .map(([file_name, row]) => ({
      file_name,
      topic_id: topicFromFileName(file_name),
      video_path: path.join(VIDEOS_DIR, file_name),
      ...row
    }))
    .sort((a, b) => a.topic_id.localeCompare(b.topic_id));
}

function checkVisualContent(videoPath) {
  if (!fs.existsSync(videoPath)) {
    return { checked: false, passed: false, error: `Missing local video: ${videoPath}` };
  }
  if (!fs.existsSync(FFMPEG_EXE)) {
    return { checked: false, passed: false, error: `Missing ffmpeg: ${FFMPEG_EXE}` };
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
    .map(match => ({ start: Number(match[1]), end: Number(match[2]), duration: Number(match[3]) }));
  const blackSeconds = blackSegments.reduce((sum, segment) => sum + segment.duration, 0);
  const blackRatio = durationSeconds ? blackSeconds / durationSeconds : 0;

  return {
    checked: true,
    passed: result.status === 0 && blackRatio < BLACK_RATIO_HOLD_THRESHOLD,
    duration_seconds: durationSeconds,
    black_seconds: Number(blackSeconds.toFixed(3)),
    black_ratio: Number(blackRatio.toFixed(4)),
    black_segments: blackSegments.slice(0, 10)
  };
}

async function getOAuthClient() {
  if (!fs.existsSync(SECRETS_FILE)) throw new Error(`OAuth secrets not found: ${SECRETS_FILE}`);
  if (!fs.existsSync(TOKENS_FILE)) throw new Error(`OAuth token not found: ${TOKENS_FILE}`);

  const secrets = readJson(SECRETS_FILE);
  const { client_id, client_secret, redirect_uris } = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
  oauth2Client.setCredentials(readJson(TOKENS_FILE));

  const refreshed = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(refreshed.credentials);
  writeJson(TOKENS_FILE, refreshed.credentials);
  return oauth2Client;
}

async function verifyAuthenticatedChannel(youtube) {
  const res = await youtube.channels.list({ part: ['snippet'], mine: true });
  const channel = res.data.items && res.data.items[0];
  if (!channel) throw new Error('OAuth succeeded, but YouTube returned no channel for this token.');

  const actualTitle = channel.snippet && channel.snippet.title;
  const idOk = EXPECTED_CHANNEL_ID ? channel.id === EXPECTED_CHANNEL_ID : true;
  const titleOk = EXPECTED_CHANNEL_TITLE
    ? String(actualTitle || '').toLowerCase() === EXPECTED_CHANNEL_TITLE.toLowerCase()
    : true;
  if (!idOk || !titleOk) {
    throw new Error(`Channel guard blocked hold. Expected ${EXPECTED_CHANNEL_TITLE}, got ${actualTitle} (${channel.id}).`);
  }
}

async function holdVideo(youtube, row) {
  const current = await youtube.videos.list({ part: ['status'], id: [row.youtube_id] });
  const video = current.data.items && current.data.items[0];
  if (!video) return { held: false, error: `YouTube returned no video for ${row.youtube_id}` };

  const currentStatus = video.status || {};
  if (!DRY_RUN) {
    await youtube.videos.update({
      part: ['status'],
      requestBody: {
        id: row.youtube_id,
        status: {
          privacyStatus: 'private',
          selfDeclaredMadeForKids: false,
          embeddable: currentStatus.embeddable !== false,
          publicStatsViewable: currentStatus.publicStatsViewable !== false
        }
      }
    });
  }

  return {
    held: true,
    previous_privacy_status: currentStatus.privacyStatus || null,
    previous_publish_at: currentStatus.publishAt || null,
    new_privacy_status: 'private',
    new_publish_at: null
  };
}

async function main() {
  const tracker = readJson(TRACKER_FILE, { uploaded_files: {} });
  const rows = trackerRows(tracker);
  const results = [];

  if (rows.length === 0) {
    console.log('No scheduled canonical SaaS Autopilot uploads found.');
  }

  const oauth2Client = DRY_RUN ? null : await getOAuthClient();
  const youtube = DRY_RUN ? null : getYoutubeClient({ version: 'v3', auth: oauth2Client });
  if (youtube) await verifyAuthenticatedChannel(youtube);

  for (const row of rows) {
    const visual = checkVisualContent(row.video_path);
    const shouldHold = !visual.passed;
    const hold = shouldHold && youtube ? await holdVideo(youtube, row) : { held: false };

    if (shouldHold && !DRY_RUN && hold.held) {
      const trackerRow = tracker.uploaded_files[row.file_name];
      trackerRow.publish_at = null;
      trackerRow.status_note = `HELD_PRIVATE_FAILED_VISUAL_QC. Was scheduled for ${row.publish_at}. Black ratio ${(visual.black_ratio * 100).toFixed(1)}%.`;
    }

    const result = {
      topic_id: row.topic_id,
      file_name: row.file_name,
      youtube_id: row.youtube_id,
      original_publish_at: row.publish_at,
      visual_qc: visual,
      action: shouldHold ? (DRY_RUN ? 'would_hold_private_clear_schedule' : 'held_private_clear_schedule') : 'none',
      hold
    };
    results.push(result);
    console.log(`${result.action.toUpperCase()} ${row.topic_id} black_ratio=${visual.black_ratio}`);
  }

  if (!DRY_RUN) writeJson(TRACKER_FILE, tracker);

  const report = {
    checked_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    threshold: BLACK_RATIO_HOLD_THRESHOLD,
    summary: {
      scheduled_checked: rows.length,
      held: results.filter(row => row.action === 'held_private_clear_schedule').length,
      would_hold: results.filter(row => row.action === 'would_hold_private_clear_schedule').length,
      passed_visual_qc: results.filter(row => row.visual_qc && row.visual_qc.passed).length
    },
    results
  };
  writeJson(path.join(REPORTS_DIR, 'youtube_visual_qc_hold_report.json'), report);
  console.log(`Report: ${path.join(REPORTS_DIR, 'youtube_visual_qc_hold_report.json')}`);
}

main().catch(err => {
  console.error(`Fatal visual QC hold error: ${err.message}`);
  process.exit(1);
});
