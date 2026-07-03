const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');

const DRAFT_IDS = ['6iydrpqSseU', 'FCPe5Dlk_xw'];

async function run() {
    console.log("🗑️ Starting YouTube Video Deletion for stale De Beers drafts...");

    if (!fs.existsSync(SECRETS_FILE) || !fs.existsSync(TOKENS_FILE)) {
        console.error("🔴 Error: Missing secrets or active session tokens.");
        process.exit(1);
    }

    const secretsData = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
    const webOrInstalled = secretsData.installed || secretsData.web;
    const { client_id, client_secret, redirect_uris } = webOrInstalled;
    const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

    oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8')));
    const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });

    for (const videoId of DRAFT_IDS) {
        try {
            console.log(`\n⏳ Deleting stale draft ID: ${videoId} from YouTube...`);
            await youtube.videos.delete({
                id: videoId
            });
            console.log(`✅ Video ID ${videoId} successfully deleted!`);
        } catch (err) {
            console.error(`🔴 Error deleting Video ID ${videoId}:`, err.message);
        }
    }
    console.log("\nDeletion cleanup complete.");
}

run().catch(console.error);
