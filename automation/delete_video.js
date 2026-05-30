const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');

const VIDEO_1_ID = 'uk1POy-kKVs';
const VIDEO_2_ID = 'GM1dVP-OLhc';

async function run() {
    console.log("🗑️ Starting YouTube Video Deletion Agent...");

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

    try {
        console.log(`\n⏳ Deleting old Video 1 (ID: ${VIDEO_1_ID}) from YouTube...`);
        await youtube.videos.delete({
            id: VIDEO_1_ID
        });
        console.log(`✅ Video 1 successfully deleted!`);

        console.log(`\n⏳ Deleting old Video 2 (ID: ${VIDEO_2_ID}) from YouTube...`);
        await youtube.videos.delete({
            id: VIDEO_2_ID
        });
        console.log(`✅ Video 2 successfully deleted!`);

        console.log(`\n=================================================`);
        console.log(`🎉 SUCCESS! Old videos removed. Ready for re-upload.`);
        console.log(`=================================================\n`);

    } catch (err) {
        console.error("🔴 Error during deletion:", err.message);
    }
}

run().catch(console.error);
