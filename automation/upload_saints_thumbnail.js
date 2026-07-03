const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const ROOT = path.resolve(__dirname, '..');
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SAINTS_CREDENTIALS_DIR = path.join(ROOT, 'The Saints', 'automation', 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(SAINTS_CREDENTIALS_DIR, 'saints_oauth_tokens.json');
const EXPECTED_CHANNEL_ID = process.env.SAINTS_YOUTUBE_CHANNEL_ID || 'UCdXKrXsLAL_EhU-lPHDg3bw';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

async function main() {
  const videoId = process.argv[2];
  const thumbnailArg = process.argv[3];
  if (!videoId || !thumbnailArg) {
    throw new Error('Usage: node automation/upload_saints_thumbnail.js <youtube_video_id> <thumbnail_path>');
  }

  const thumbnailPath = path.isAbsolute(thumbnailArg) ? thumbnailArg : path.join(ROOT, thumbnailArg);
  if (!fs.existsSync(thumbnailPath)) throw new Error(`Thumbnail not found: ${thumbnailPath}`);
  if (!fs.existsSync(SECRETS_FILE)) throw new Error(`Missing client secrets: ${SECRETS_FILE}`);
  if (!fs.existsSync(TOKENS_FILE)) throw new Error(`Missing Saints tokens: ${TOKENS_FILE}`);

  const secrets = readJson(SECRETS_FILE);
  const client = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(
    client.client_id,
    client.client_secret,
    client.redirect_uris?.[0] || 'http://localhost:3000'
  );
  oauth2Client.on('tokens', (tokens) => {
    const existing = fs.existsSync(TOKENS_FILE) ? readJson(TOKENS_FILE) : {};
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({ ...existing, ...tokens }, null, 2));
  });
  oauth2Client.setCredentials(readJson(TOKENS_FILE));

  const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });
  const channel = await youtube.channels.list({ part: ['snippet'], mine: true });
  const channelId = channel.data.items?.[0]?.id || '';
  if (channelId !== EXPECTED_CHANNEL_ID) {
    throw new Error(`Authenticated channel mismatch. Expected ${EXPECTED_CHANNEL_ID}, got ${channelId || 'unknown'}.`);
  }

  const result = await youtube.thumbnails.set({
    videoId,
    media: { body: fs.createReadStream(thumbnailPath) }
  });
  const video = await youtube.videos.list({ part: ['snippet', 'status'], id: [videoId] });
  const item = video.data.items?.[0];

  console.log(JSON.stringify({
    ok: true,
    channelId,
    videoId,
    status: result.status,
    title: item?.snippet?.title || '',
    privacyStatus: item?.status?.privacyStatus || '',
    thumbnailPath
  }, null, 2));
}

main().catch((err) => {
  console.error(err.response?.data ? JSON.stringify(err.response.data, null, 2) : err.message);
  process.exit(1);
});
