const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const videoId = process.argv[2] || 'FCPe5Dlk_xw';
const thumbnailPath = process.argv[3] || path.join(__dirname, '..', 'assets', 'youtube_thumbnail.png');
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');
function readJsonFile(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')); }
async function main() {
  if (!fs.existsSync(thumbnailPath)) throw new Error(`Thumbnail not found: ${thumbnailPath}`);
  const s = readJsonFile(SECRETS_FILE);
  const c = s.installed || s.web;
  const oauth2Client = new OAuth2Client(c.client_id, c.client_secret, c.redirect_uris[0] || 'http://localhost:3000');
  oauth2Client.on('tokens', (tokens) => {
    const existing = fs.existsSync(TOKENS_FILE) ? readJsonFile(TOKENS_FILE) : {};
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({ ...existing, ...tokens }, null, 2));
  });
  oauth2Client.setCredentials(readJsonFile(TOKENS_FILE));
  const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });
  const res = await youtube.thumbnails.set({ videoId, media: { body: fs.createReadStream(thumbnailPath) } });
  const video = await youtube.videos.list({ part: ['snippet','status'], id: [videoId] });
  const item = video.data.items?.[0];
  console.log(JSON.stringify({
    videoId,
    thumbnailSetStatus: res.status,
    title: item?.snippet?.title,
    publishAt: item?.status?.publishAt || null,
    privacyStatus: item?.status?.privacyStatus,
    thumbnails: item?.snippet?.thumbnails || {}
  }, null, 2));
}
main().catch(err => { console.error(err.response?.data ? JSON.stringify(err.response.data, null, 2) : err.message); process.exit(1); });