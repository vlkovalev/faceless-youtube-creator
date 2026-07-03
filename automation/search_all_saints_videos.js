const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const REPO_ROOT = path.resolve(__dirname, '..');
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

async function searchVideos() {
  const youtube = await getYoutubeService();
  console.log("Searching all videos...");

  const response = await youtube.search.list({
    part: 'id,snippet',
    forMine: true,
    type: 'video',
    maxResults: 50
  });

  const items = response.data.items || [];
  console.log(`Search returned ${items.length} items.`);

  const videoIds = items.map(item => item.id.videoId).filter(Boolean);
  if (videoIds.length === 0) {
    console.log("No videos found via search.");
    return;
  }

  const detailsRes = await youtube.videos.list({
    part: 'id,snippet,status',
    id: videoIds.join(',')
  });

  const videos = detailsRes.data.items || [];
  console.log("\n--- SEARCH RESULTS ---");
  for (const video of videos) {
    console.log(`ID: ${video.id}`);
    console.log(`Title: ${video.snippet.title}`);
    console.log(`Status: ${video.status.privacyStatus}`);
    console.log(`Uploaded at: ${video.snippet.publishedAt}`);
    console.log(`Thumbnail URL: ${video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url}`);
    console.log("-----------------------------------------");
  }
}

searchVideos().catch(err => {
  console.error("Error searching videos:", err);
});
