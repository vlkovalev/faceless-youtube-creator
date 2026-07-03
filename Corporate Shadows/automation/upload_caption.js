const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const videoId = process.argv[2];
const captionPath = process.argv[3];

if (!videoId || !captionPath) {
  console.error('Usage: node automation/upload_caption.js <video_id> <caption.srt>');
  process.exit(1);
}

const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
}

async function main() {
  if (!fs.existsSync(captionPath)) {
    throw new Error(`Caption file not found: ${captionPath}`);
  }

  const secrets = readJsonFile(SECRETS_FILE);
  const cfg = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(
    cfg.client_id,
    cfg.client_secret,
    (cfg.redirect_uris || ['http://localhost:3000'])[0]
  );

  oauth2Client.on('tokens', tokens => {
    const existing = fs.existsSync(TOKENS_FILE) ? readJsonFile(TOKENS_FILE) : {};
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({ ...existing, ...tokens }, null, 2));
  });

  oauth2Client.setCredentials(readJsonFile(TOKENS_FILE));
  const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });

  const existing = await youtube.captions.list({ part: ['snippet'], videoId });
  for (const caption of existing.data.items || []) {
    if (caption.snippet && caption.snippet.language === 'en') {
      await youtube.captions.delete({ id: caption.id });
    }
  }

  const res = await youtube.captions.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        videoId,
        language: 'en',
        name: 'English Captions',
        isDraft: false
      }
    },
    media: {
      body: fs.createReadStream(captionPath),
      mimeType: 'text/srt'
    }
  });

  console.log(JSON.stringify({
    videoId,
    captionPath,
    captionId: res.data.id,
    language: res.data.snippet && res.data.snippet.language,
    isDraft: res.data.snippet && res.data.snippet.isDraft
  }, null, 2));
}

main().catch(err => {
  console.error(err.response && err.response.data ? JSON.stringify(err.response.data, null, 2) : err.message);
  process.exit(1);
});
