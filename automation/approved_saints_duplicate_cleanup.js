'use strict';

const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
const { REPO_ROOT, SAINTS_CREDENTIALS_DIR } = require('./channel_paths');

const ROOT = REPO_ROOT;
const LOG_FILE = path.join(ROOT, 'metadata', 'approved_channel_cleanup_log.json');
const SECRETS_FILE = path.join(__dirname, 'credentials', 'client_secrets.json');
const TOKENS_FILE = path.join(SAINTS_CREDENTIALS_DIR, 'saints_oauth_tokens.json');
const EXPECTED_ID = 'UCdXKrXsLAL_EhU-lPHDg3bw';
const EXPECTED_TITLE = 'The Saints';

const DUPLICATES_TO_DELETE = [
  {
    video_id: 'v_M0lj7zMa8',
    keep_id: 'em--8jLdjPw',
    reason: 'older_duplicate_forest_monk_private_draft_superseded_by_polished_version'
  }
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function getYoutube() {
  const secrets = readJson(SECRETS_FILE);
  const cfg = secrets.installed || secrets.web;
  const tokens = readJson(TOKENS_FILE);
  const oauth2Client = new OAuth2Client(
    cfg.client_id,
    cfg.client_secret,
    (cfg.redirect_uris || ['http://localhost:3000/oauth2callback'])[0]
  );
  oauth2Client.on('tokens', newTokens => writeJson(TOKENS_FILE, { ...tokens, ...newTokens }));
  oauth2Client.setCredentials(tokens);
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

async function verifyChannel(youtube) {
  const res = await youtube.channels.list({ part: ['snippet'], mine: true });
  const channel = res.data.items && res.data.items[0];
  if (!channel || channel.id !== EXPECTED_ID || channel.snippet.title !== EXPECTED_TITLE) {
    throw new Error(`Saints channel guard failed. Got ${channel?.snippet?.title || 'none'} (${channel?.id || 'none'})`);
  }
}

async function getVideo(youtube, id) {
  const res = await youtube.videos.list({ part: ['snippet', 'status'], id: [id] });
  return res.data.items && res.data.items[0];
}

async function main() {
  const youtube = await getYoutube();
  await verifyChannel(youtube);

  const log = fs.existsSync(LOG_FILE) ? readJson(LOG_FILE) : [];
  const run = {
    started_at: new Date().toISOString(),
    approved_by_user: true,
    results: []
  };

  for (const target of DUPLICATES_TO_DELETE) {
    const keep = await getVideo(youtube, target.keep_id);
    if (!keep) throw new Error(`Refusing to delete ${target.video_id}; keeper ${target.keep_id} was not found.`);

    const item = await getVideo(youtube, target.video_id);
    if (!item) {
      run.results.push({ profile: 'saints', video_id: target.video_id, keep_id: target.keep_id, status: 'already_missing', reason: target.reason });
      continue;
    }

    if (item.status.privacyStatus !== 'private') {
      throw new Error(`Refusing to delete ${target.video_id}; expected private, got ${item.status.privacyStatus}.`);
    }

    await youtube.videos.delete({ id: target.video_id });
    run.results.push({
      profile: 'saints',
      video_id: target.video_id,
      keep_id: target.keep_id,
      title: item.snippet.title,
      privacy_status: item.status.privacyStatus,
      reason: target.reason,
      status: 'deleted'
    });
    console.log(`Deleted older Saints duplicate: ${target.video_id} | kept ${target.keep_id} | ${item.snippet.title}`);
  }

  run.finished_at = new Date().toISOString();
  log.push(run);
  writeJson(LOG_FILE, log);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
