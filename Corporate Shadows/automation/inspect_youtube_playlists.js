const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');
function readJsonFile(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')); }
async function main() {
  const s = readJsonFile(SECRETS_FILE); const c = s.installed || s.web;
  const oauth2Client = new OAuth2Client(c.client_id, c.client_secret, c.redirect_uris[0] || 'http://localhost:3000');
  oauth2Client.setCredentials(readJsonFile(TOKENS_FILE));
  const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });
  const ch = await youtube.channels.list({ part: ['snippet','contentDetails'], mine: true });
  console.log('CHANNELS', JSON.stringify(ch.data.items.map(x => ({ id:x.id, title:x.snippet.title })), null, 2));
  const pl = await youtube.playlists.list({ part: ['snippet','status'], mine: true, maxResults: 50 });
  console.log('PLAYLISTS', JSON.stringify((pl.data.items || []).map(x => ({ id:x.id, title:x.snippet.title, privacy:x.status.privacyStatus })), null, 2));
}
main().catch(e => { console.error(e.response?.data || e.message); process.exit(1); });