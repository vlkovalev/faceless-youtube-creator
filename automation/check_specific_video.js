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

async function getYoutubeService() {
  const secretsData = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
  const webOrInstalled = secretsData.installed || secretsData.web;
  const { client_id, client_secret, redirect_uris } = webOrInstalled;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
  oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8')));
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

async function checkSpecificVideo(videoId) {
  const youtube = await getYoutubeService();
  console.log(`Checking video status for ID: ${videoId}...`);
  try {
    const res = await youtube.videos.list({
      part: 'id,snippet,status',
      id: videoId
    });
    const items = res.data.items || [];
    if (items.length === 0) {
      console.log(`Video ID ${videoId} NOT FOUND on YouTube (it might be deleted).`);
    } else {
      const video = items[0];
      console.log(`Found Video ID: ${video.id}`);
      console.log(`Title: ${video.snippet.title}`);
      console.log(`Status: ${video.status.privacyStatus}`);
      console.log(`Uploaded at: ${video.snippet.publishedAt}`);
    }
  } catch (err) {
    console.error("Error querying video:", err.message);
  }
}

// Check some video IDs from uploads_tracker
const idsToCheck = ['nKrZldJtDMc', 'fRrREW7IJXI', 'w3e6LIVdEKY'];
async function run() {
  for (const id of idsToCheck) {
    await checkSpecificVideo(id);
    console.log("------------------------");
  }
}
run();
