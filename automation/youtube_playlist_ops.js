const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const WORKSPACE_DIR = path.join(__dirname, '..');
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');
const CHANNEL_CONFIG = path.join(WORKSPACE_DIR, 'channel_config.json');
const QUEUE_FILE = path.join(WORKSPACE_DIR, 'metadata', 'queue.json');

const PLAYLIST_TITLE = 'Dark Business Empires';
const PLAYLIST_DESCRIPTION = 'Dark business history documentaries about monopolies, corporate scandals, cartels, and empires built on power.';
const VIDEO_ID = process.argv[2] || 'FCPe5Dlk_xw';

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
}
function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function client() {
  const secretsData = readJsonFile(SECRETS_FILE);
  const webOrInstalled = secretsData.installed || secretsData.web;
  const { client_id, client_secret, redirect_uris } = webOrInstalled;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0] || 'http://localhost:3000');
  oauth2Client.on('tokens', (tokens) => {
    const existingTokens = fs.existsSync(TOKENS_FILE) ? readJsonFile(TOKENS_FILE) : {};
    writeJsonFile(TOKENS_FILE, { ...existingTokens, ...tokens });
  });
  oauth2Client.setCredentials(readJsonFile(TOKENS_FILE));
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

async function findOrCreatePlaylist(youtube) {
  let pageToken;
  do {
    const res = await youtube.playlists.list({ part: ['snippet', 'status'], mine: true, maxResults: 50, pageToken });
    const found = (res.data.items || []).find(p => p.snippet.title === PLAYLIST_TITLE);
    if (found) return { playlist: found, created: false };
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  const created = await youtube.playlists.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: PLAYLIST_TITLE, description: PLAYLIST_DESCRIPTION },
      status: { privacyStatus: 'public' }
    }
  });
  return { playlist: created.data, created: true };
}

async function ensureVideoInPlaylist(youtube, playlistId, videoId) {
  let pageToken;
  do {
    const res = await youtube.playlistItems.list({ part: ['snippet'], playlistId, maxResults: 50, pageToken });
    const exists = (res.data.items || []).some(item => item.snippet.resourceId && item.snippet.resourceId.videoId === videoId);
    if (exists) return { added: false };
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  await youtube.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId }
      }
    }
  });
  return { added: true };
}

function updateLocalConfig(playlistId) {
  const config = readJsonFile(CHANNEL_CONFIG);
  if (!config.growth_system) config.growth_system = {};
  if (!config.growth_system.primary_playlist) config.growth_system.primary_playlist = {};
  config.growth_system.primary_playlist.youtube_playlist_id = playlistId;
  writeJsonFile(CHANNEL_CONFIG, config);

  const queue = readJsonFile(QUEUE_FILE);
  for (const item of queue) {
    if (item.playlist_title === PLAYLIST_TITLE || item.filename === 'FINAL_VIDEO_1_VISUAL_UPGRADE.mp4') {
      item.playlist_id = playlistId;
    }
  }
  writeJsonFile(QUEUE_FILE, queue);
}

async function main() {
  const youtube = await client();
  const { playlist, created } = await findOrCreatePlaylist(youtube);
  const playlistId = playlist.id;
  const { added } = await ensureVideoInPlaylist(youtube, playlistId, VIDEO_ID);
  updateLocalConfig(playlistId);
  console.log(JSON.stringify({ playlistId, title: playlist.snippet.title, created, videoId: VIDEO_ID, addedVideo: added }, null, 2));
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});