/**
 * SaaS Autopilot YouTube Description Repair Agent
 * ===============================================
 * Updates already-uploaded SaaS Autopilot YouTube video descriptions from the
 * fixed local script metadata JSON files.
 *
 * Usage:
 *   node automation/saas_autopilot_youtube_description_repair_agent.js --dry-run
 *   node automation/saas_autopilot_youtube_description_repair_agent.js
 *   node automation/saas_autopilot_youtube_description_repair_agent.js --topic SAAS-003
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const WORKSPACE_DIR = path.join(__dirname, '..');
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SCRIPTS_DIR = path.join(WORKSPACE_DIR, 'scripts', 'saas_autopilot');
const METADATA_DIR = path.join(WORKSPACE_DIR, 'metadata');
const REPORTS_DIR = path.join(METADATA_DIR, 'qa_reports');

const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_oauth_token.json');
const TRACKER_FILE = path.join(METADATA_DIR, 'uploads_tracker.json');
const EXPECTED_CHANNEL_TITLE = process.env.SAAS_AUTOPILOT_YOUTUBE_CHANNEL_TITLE || 'SaaS Autopilot';
const EXPECTED_CHANNEL_ID = process.env.SAAS_AUTOPILOT_YOUTUBE_CHANNEL_ID || '';

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true';
const ONLY_TOPIC = args.topic ? String(args.topic).toUpperCase() : null;

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function sanitizeId(id) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function topicFromFileName(fileName) {
  return path.basename(fileName, '_FINAL.mp4').replace(/_/g, '-');
}

function trackerRows() {
  const tracker = readJson(TRACKER_FILE, { uploaded_files: {} });
  return Object.entries(tracker.uploaded_files || {})
    .filter(([, row]) => row && row.channel === 'saas_autopilot' && row.canonical && row.youtube_id)
    .map(([file_name, row]) => ({
      file_name,
      topic_id: topicFromFileName(file_name),
      ...row
    }))
    .filter(row => !ONLY_TOPIC || row.topic_id === ONLY_TOPIC)
    .sort((a, b) => a.topic_id.localeCompare(b.topic_id));
}

async function getOAuthClient() {
  if (!fs.existsSync(SECRETS_FILE)) {
    throw new Error(`OAuth secrets not found: ${SECRETS_FILE}`);
  }
  if (!fs.existsSync(TOKENS_FILE)) {
    throw new Error(`OAuth token not found: ${TOKENS_FILE}`);
  }

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
    throw new Error(`Channel guard blocked repair. Expected ${EXPECTED_CHANNEL_TITLE}, got ${actualTitle} (${channel.id}).`);
  }
}

async function updateDescription(youtube, row) {
  const scriptPath = path.join(SCRIPTS_DIR, `${sanitizeId(row.topic_id)}_data.json`);
  const script = readJson(scriptPath);
  if (!script) {
    return { ...row, status: 'failed', error: `Missing script metadata: ${scriptPath}` };
  }

  const desiredDescription = script.metadata && script.metadata.description_template;
  if (!desiredDescription) {
    return { ...row, status: 'failed', error: `Missing description_template: ${scriptPath}` };
  }

  const current = await youtube.videos.list({
    part: ['snippet'],
    id: [row.youtube_id]
  });
  const video = current.data.items && current.data.items[0];
  if (!video) {
    return { ...row, status: 'failed', error: `YouTube returned no video for ${row.youtube_id}` };
  }

  const snippet = video.snippet || {};
  const alreadyFixed = snippet.description === desiredDescription;
  if (alreadyFixed) {
    return { ...row, status: 'unchanged', url: `https://www.youtube.com/watch?v=${row.youtube_id}` };
  }

  if (!DRY_RUN) {
    await youtube.videos.update({
      part: ['snippet'],
      requestBody: {
        id: row.youtube_id,
        snippet: {
          title: snippet.title,
          description: desiredDescription,
          tags: script.metadata.tags || snippet.tags || [],
          categoryId: snippet.categoryId || '26',
          defaultLanguage: snippet.defaultLanguage,
          defaultAudioLanguage: snippet.defaultAudioLanguage
        }
      }
    });
  }

  return {
    ...row,
    status: DRY_RUN ? 'would_update' : 'updated',
    url: `https://www.youtube.com/watch?v=${row.youtube_id}`
  };
}

async function main() {
  const rows = trackerRows();
  if (rows.length === 0) {
    throw new Error(ONLY_TOPIC ? `No uploaded row found for ${ONLY_TOPIC}` : 'No uploaded SaaS Autopilot rows found.');
  }

  const oauth2Client = await getOAuthClient();
  const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });
  await verifyAuthenticatedChannel(youtube);

  const results = [];
  for (const row of rows) {
    const result = await updateDescription(youtube, row);
    results.push(result);
    console.log(`${result.status.toUpperCase()} ${result.topic_id} ${result.youtube_id} ${result.error || ''}`);
  }

  const report = {
    checked_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    only_topic: ONLY_TOPIC,
    summary: {
      total: results.length,
      updated: results.filter(r => r.status === 'updated').length,
      unchanged: results.filter(r => r.status === 'unchanged').length,
      would_update: results.filter(r => r.status === 'would_update').length,
      failed: results.filter(r => r.status === 'failed').length
    },
    results
  };

  const reportPath = path.join(REPORTS_DIR, 'youtube_description_repair_report.json');
  writeJson(reportPath, report);
  console.log(`Report: ${reportPath}`);

  if (report.summary.failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(`Fatal repair error: ${err.message}`);
  process.exit(1);
});
