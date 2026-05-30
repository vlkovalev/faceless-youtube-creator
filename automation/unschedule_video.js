const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const videoId = process.argv[2];
if (!videoId) {
  console.error('Usage: node automation/unschedule_video.js <youtube_video_id>');
  process.exit(1);
}

const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');
function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
}

async function main() {
  const secretsData = readJsonFile(SECRETS_FILE);
  const webOrInstalled = secretsData.installed || secretsData.web;
  const { client_id, client_secret, redirect_uris } = webOrInstalled;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0] || 'http://localhost:3000');
  oauth2Client.on('tokens', (tokens) => {
    const existingTokens = fs.existsSync(TOKENS_FILE) ? readJsonFile(TOKENS_FILE) : {};
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({ ...existingTokens, ...tokens }, null, 2));
  });
  oauth2Client.setCredentials(readJsonFile(TOKENS_FILE));
  const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });

  const current = await youtube.videos.list({ part: ['snippet', 'status'], id: [videoId] });
  const item = current.data.items && current.data.items[0];
  if (!item) {
    console.error(`Video ${videoId} not found.`);
    process.exit(1);
  }

  const status = {
    ...item.status,
    privacyStatus: 'private',
    selfDeclaredMadeForKids: false
  };
  delete status.publishAt;

  await youtube.videos.update({
    part: ['status'],
    requestBody: {
      id: videoId,
      status
    }
  });

  const updated = await youtube.videos.list({ part: ['snippet', 'status'], id: [videoId] });
  const updatedItem = updated.data.items[0];
  console.log(JSON.stringify({
    id: updatedItem.id,
    title: updatedItem.snippet.title,
    privacyStatus: updatedItem.status.privacyStatus,
    publishAt: updatedItem.status.publishAt || null
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});