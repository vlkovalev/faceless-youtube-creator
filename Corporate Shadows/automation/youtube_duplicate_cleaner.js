const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');

async function getYoutubeService() {
  if (!fs.existsSync(SECRETS_FILE) || !fs.existsSync(TOKENS_FILE)) {
    throw new Error("Missing client secrets or active session tokens. Run the uploader auth setup first.");
  }
  const secretsData = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
  const webOrInstalled = secretsData.installed || secretsData.web;
  const { client_id, client_secret, redirect_uris } = webOrInstalled;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
  oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8')));
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

async function cleanDuplicates() {
  console.log("🧹 Starting Autonomous YouTube Video Duplicate Cleaner...");
  const youtube = await getYoutubeService();

  // 1. Fetch channel uploads / drafts (we fetch the last 50 videos)
  const response = await youtube.search.list({
    part: 'id,snippet',
    forMine: true,
    type: 'video',
    maxResults: 50
  });

  const items = response.data.items || [];
  console.log(`[INFO] Found ${items.length} total videos on the channel.`);

  // 2. Fetch full details to check publication status and exact publish dates
  const videoIds = items.map(item => item.id.videoId).filter(Boolean);
  if (videoIds.length === 0) {
    console.log("[OK] No videos found on channel.");
    return;
  }

  const detailsRes = await youtube.videos.list({
    part: 'id,snippet,status',
    id: videoIds.join(',')
  });

  const videos = detailsRes.data.items || [];

  // Group videos by normalized title
  const groups = {};
  for (const video of videos) {
    const title = video.snippet.title.trim();
    // Normalize: lowercase, strip OMNI FLASH or visual upgrade suffixes to identify same content
    const normTitle = title.toLowerCase()
      .replace(/[\(\[].*?[\)\]]/g, '') // remove brackets
      .replace(/\s+/g, ' ')
      .trim();

    if (!groups[normTitle]) groups[normTitle] = [];
    groups[normTitle].push(video);
  }

  let deletedCount = 0;
  for (const [normTitle, group] of Object.entries(groups)) {
    if (group.length <= 1) continue;

    console.log(`\n[DUPLICATE DETECTED] "${normTitle}" has ${group.length} uploads!`);

    // Sort group: Keep the most recently uploaded/scheduled one, delete the older ones
    group.sort((a, b) => {
      const dateA = new Date(a.snippet.publishedAt);
      const dateB = new Date(b.snippet.publishedAt);
      return dateB - dateA; // descending order (newest first)
    });

    const keepVideo = group[0];
    const toDelete = group.slice(1);

    console.log(`  -> KEEPING Newest: ${keepVideo.snippet.title} (ID: ${keepVideo.id}, Status: ${keepVideo.status.privacyStatus})`);

    for (const oldVideo of toDelete) {
      console.log(`  🗑️ DELETING Redundant: ${oldVideo.snippet.title} (ID: ${oldVideo.id}, Uploaded: ${oldVideo.snippet.publishedAt})`);
      try {
        await youtube.videos.delete({ id: oldVideo.id });
        console.log(`  ✅ Successfully deleted duplicate ID: ${oldVideo.id}`);
        deletedCount++;
      } catch (err) {
        console.error(`  [ERROR] Failed to delete duplicate ID ${oldVideo.id}:`, err.message);
      }
    }
  }

  console.log(`\n=================================================`);
  console.log(`[SUCCESS] Cleanup complete! Deleted ${deletedCount} duplicate uploads.`);
  console.log(`=================================================\n`);
}

if (require.main === module) {
  cleanDuplicates().catch(err => {
    console.error("🔴 Fatal error:", err.message);
    process.exit(1);
  });
}

module.exports = { cleanDuplicates };
