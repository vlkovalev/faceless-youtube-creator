'use strict';

const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
const { REPO_ROOT, SAINTS_CREDENTIALS_DIR } = require('./channel_paths');

const ROOT = REPO_ROOT;
const SHARED_CREDENTIALS = path.join(__dirname, 'credentials');
const LOG_FILE = path.join(ROOT, 'metadata', 'approved_channel_cleanup_log.json');

const CLEANUP_PLAN = [
  {
    profile: 'saints',
    expectedTitle: 'The Saints',
    expectedId: 'UCdXKrXsLAL_EhU-lPHDg3bw',
    secretsFile: path.join(SHARED_CREDENTIALS, 'client_secrets.json'),
    tokensFile: path.join(SAINTS_CREDENTIALS_DIR, 'saints_oauth_tokens.json'),
    reason: 'wrong_channel_saas_autopilot_draft_on_saints',
    videos: [
      'wf1ngQ0LUOs',
      'IiMUdspafGQ',
      '2v0hZRqUrrE',
      'jLxHw0ybwGQ',
      'JL9IMlqgetA',
      'OdvlAw9YIFY',
      '8rPLvpiX5uA',
      'cxn767aiTGg',
      'PjfY7hdCX-w',
      'CZ3Kq_msPzM',
      'Mnm6rQxm3MY',
      'yIpPK8e8cyw',
      'Gf5oasoSl-s',
      'nXYNOrKnxhU'
    ]
  },
  {
    profile: 'saas_autopilot',
    expectedTitle: 'SaaS Autopilot',
    expectedId: 'UC1_pK6I1tgK4rRsDP8NX0Bw',
    secretsFile: path.join(ROOT, 'SaaS Autopilot', 'automation', 'credentials', 'saas_autopilot_client_secrets.json'),
    tokensFile: path.join(ROOT, 'SaaS Autopilot', 'automation', 'credentials', 'saas_autopilot_oauth_token.json'),
    reason: 'superseded_duplicate_saas_001',
    videos: ['OGwjUVY-TUM']
  }
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function getYoutube(profile) {
  if (!fs.existsSync(profile.secretsFile)) throw new Error(`Missing secrets: ${profile.secretsFile}`);
  if (!fs.existsSync(profile.tokensFile)) throw new Error(`Missing tokens: ${profile.tokensFile}`);

  const secrets = readJson(profile.secretsFile);
  const cfg = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(
    cfg.client_id,
    cfg.client_secret,
    (cfg.redirect_uris || ['http://localhost:3000/oauth2callback'])[0]
  );
  const tokens = readJson(profile.tokensFile);
  oauth2Client.on('tokens', newTokens => writeJson(profile.tokensFile, { ...tokens, ...newTokens }));
  oauth2Client.setCredentials(tokens);
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

async function verifyChannel(youtube, profile) {
  const res = await youtube.channels.list({ part: ['snippet'], mine: true });
  const channel = res.data.items && res.data.items[0];
  if (!channel) throw new Error(`No channel returned for ${profile.profile}`);
  if (channel.id !== profile.expectedId || channel.snippet.title !== profile.expectedTitle) {
    throw new Error(
      `Channel guard blocked ${profile.profile}: expected ${profile.expectedTitle} (${profile.expectedId}), ` +
      `got ${channel.snippet.title} (${channel.id})`
    );
  }
  return { id: channel.id, title: channel.snippet.title };
}

async function getVideo(youtube, videoId) {
  const res = await youtube.videos.list({ part: ['snippet', 'status'], id: [videoId] });
  return res.data.items && res.data.items[0];
}

function removeSaasDuplicateFromLocalState(videoId) {
  const files = [
    path.join(ROOT, 'SaaS Autopilot', 'metadata', 'canonical_slate.json'),
    path.join(ROOT, 'SaaS Autopilot', 'metadata', 'uploads_tracker.json')
  ];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const data = readJson(file);
    let changed = false;

    if (data.uploaded_files) {
      for (const [filename, record] of Object.entries(data.uploaded_files)) {
        if (record && record.youtube_id === videoId) {
          delete data.uploaded_files[filename];
          changed = true;
        }
      }
    }

    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) {
        const before = data[key].length;
        data[key] = data[key].filter(entry => entry.youtube_id !== videoId);
        changed = changed || data[key].length !== before;
      }
    }

    if (changed) writeJson(file, data);
  }
}

async function main() {
  const log = fs.existsSync(LOG_FILE) ? readJson(LOG_FILE) : [];
  const run = {
    started_at: new Date().toISOString(),
    approved_by_user: true,
    results: []
  };

  for (const profile of CLEANUP_PLAN) {
    const youtube = await getYoutube(profile);
    const channel = await verifyChannel(youtube, profile);
    console.log(`Verified ${profile.profile}: ${channel.title} (${channel.id})`);

    for (const videoId of profile.videos) {
      const item = await getVideo(youtube, videoId);
      if (!item) {
        run.results.push({ profile: profile.profile, video_id: videoId, status: 'already_missing', reason: profile.reason });
        console.log(`Already missing: ${videoId}`);
        continue;
      }

      await youtube.videos.delete({ id: videoId });
      run.results.push({
        profile: profile.profile,
        video_id: videoId,
        title: item.snippet.title,
        privacy_status: item.status.privacyStatus,
        reason: profile.reason,
        status: 'deleted'
      });
      console.log(`Deleted ${profile.profile}: ${videoId} | ${item.snippet.title}`);

      if (profile.profile === 'saas_autopilot') {
        removeSaasDuplicateFromLocalState(videoId);
      }
    }
  }

  run.finished_at = new Date().toISOString();
  log.push(run);
  writeJson(LOG_FILE, log);
  console.log(`Cleanup log written: ${LOG_FILE}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
