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

async function listVideos() {
  const youtube = await getYoutubeService();
  console.log("Fetching uploads playlist...");

  // First list channels to get the uploads playlist ID
  const channelRes = await youtube.channels.list({
    part: 'contentDetails',
    mine: true
  });

  const uploadsPlaylistId = channelRes.data.items[0].contentDetails.relatedPlaylists.uploads;
  console.log(`Uploads playlist ID: ${uploadsPlaylistId}`);

  // Fetch items from the uploads playlist
  let nextToken = null;
  const allVideos = [];
  do {
    const playlistItemsRes = await youtube.playlistItems.list({
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken: nextToken
    });

    const items = playlistItemsRes.data.items || [];
    for (const item of items) {
      allVideos.push(item);
    }
    nextToken = playlistItemsRes.data.nextPageToken;
  } while (nextToken);

  console.log(`Found ${allVideos.length} videos in the uploads playlist.`);

  // Get details (status) for all videos in chunks of 50
  const chunks = [];
  for (let i = 0; i < allVideos.length; i += 50) {
    chunks.push(allVideos.slice(i, i + 50));
  }

  const detailedVideos = [];
  for (const chunk of chunks) {
    const ids = chunk.map(item => item.contentDetails.videoId).filter(Boolean);
    const videoDetailsRes = await youtube.videos.list({
      part: 'id,snippet,status',
      id: ids.join(',')
    });
    detailedVideos.push(...(videoDetailsRes.data.items || []));
  }

  // Print results
  console.log("\n--- YOUTUBE VIDEOS ---");
  for (const video of detailedVideos) {
    console.log(`ID: ${video.id}`);
    console.log(`Title: ${video.snippet.title}`);
    console.log(`Status: ${video.status.privacyStatus}`);
    console.log(`Uploaded at: ${video.snippet.publishedAt}`);
    console.log(`Thumbnail URL: ${video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url}`);
    console.log("-----------------------------------------");
  }
}

listVideos().catch(err => {
  console.error("Error listing videos:", err);
});
