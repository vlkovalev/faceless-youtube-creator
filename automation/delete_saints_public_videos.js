const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const REPO_ROOT = 'c:\\Users\\heliu\\Desktop\\WebSItes\\faceless-youtube-creator-clean';
const SAINTS_ROOT = path.join(REPO_ROOT, 'The Saints');
const SAINTS_CREDENTIALS_DIR = path.join(SAINTS_ROOT, 'automation', 'credentials');
const CREDENTIALS_DIR = path.join(REPO_ROOT, 'automation', 'credentials');

const SECRETS_FILE = fs.existsSync(path.join(SAINTS_CREDENTIALS_DIR, 'client_secrets.json'))
  ? path.join(SAINTS_CREDENTIALS_DIR, 'client_secrets.json')
  : path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(SAINTS_CREDENTIALS_DIR, 'saints_oauth_tokens.json');

const videoIds = [
  { id: 13, youtubeId: 'nKrZldJtDMc' },
  { id: 14, youtubeId: 'fRrREW7IJXI' },
  { id: 15, youtubeId: 'nYS4ZyYXKDY' },
  { id: 16, youtubeId: 'QK1jYvTRhqM' },
  { id: 17, youtubeId: 'ZrTgHuAkyIE' },
  { id: 18, youtubeId: 'T4KpqfNhF-8' },
  { id: 19, youtubeId: 'Mti1SfHhxuQ' },
  { id: 20, youtubeId: 'XeE7fWWJoHY' }
];

async function getYoutubeService() {
  if (!fs.existsSync(SECRETS_FILE) || !fs.existsSync(TOKENS_FILE)) {
    throw new Error(`Missing secrets or tokens at SECRETS_FILE: ${SECRETS_FILE}, TOKENS_FILE: ${TOKENS_FILE}`);
  }
  const secretsData = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
  const webOrInstalled = secretsData.installed || secretsData.web;
  const { client_id, client_secret, redirect_uris } = webOrInstalled;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
  oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8')));
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

async function run() {
  console.log("🗑️ Starting Saints YouTube Video Deletion Agent...");
  const youtube = await getYoutubeService();

  for (const v of videoIds) {
    try {
      console.log(`⏳ Deleting video for Saints ${v.id} (ID: ${v.youtubeId})...`);
      await youtube.videos.delete({
        id: v.youtubeId
      });
      console.log(`✅ Saints ${v.id} successfully deleted!`);
    } catch (err) {
      console.error(`🔴 Error deleting Saints ${v.id} (ID: ${v.youtubeId}):`, err.message);
    }
  }

  console.log("\n=================================================");
  console.log("🎉 Video deletion complete!");
  console.log("=================================================\n");
}

run().catch(console.error);
