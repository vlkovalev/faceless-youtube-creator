const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');

const VIDEO_1_ID = 'uk1POy-kKVs';
const VIDEO_2_ID = 'GM1dVP-OLhc';

// Tomorrow is Monday, May 25, 2026
// We will set Video 1 to May 25 at 10:00 AM Denver Time (16:00 UTC)
const VIDEO_1_PUBLISH = '2026-05-25T16:00:00.000Z';

// Video 2 will be set to Thursday, May 28 at 10:00 AM Denver Time (16:00 UTC)
const VIDEO_2_PUBLISH = '2026-05-28T16:00:00.000Z';

async function run() {
    console.log("🔄 Starting YouTube Reschedule Agent...");

    if (!fs.existsSync(SECRETS_FILE) || !fs.existsSync(TOKENS_FILE)) {
        console.error("🔴 Error: Missing secrets or active session tokens. Make sure you are authenticated.");
        process.exit(1);
    }

    const secretsData = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
    const webOrInstalled = secretsData.installed || secretsData.web;
    const { client_id, client_secret, redirect_uris } = webOrInstalled;
    const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

    oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8')));
    const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });

    try {
        console.log(`\n⏳ Rescheduling Video 1 (ID: ${VIDEO_1_ID}) to tomorrow: ${VIDEO_1_PUBLISH}...`);
        await youtube.videos.update({
            part: ['status', 'id'],
            requestBody: {
                id: VIDEO_1_ID,
                status: {
                    privacyStatus: 'private',
                    publishAt: VIDEO_1_PUBLISH,
                    selfDeclaredMadeForKids: false
                }
            }
        });
        console.log(`✅ Video 1 successfully rescheduled!`);

        console.log(`\n⏳ Rescheduling Video 2 (ID: ${VIDEO_2_ID}) to Thursday: ${VIDEO_2_PUBLISH}...`);
        await youtube.videos.update({
            part: ['status', 'id'],
            requestBody: {
                id: VIDEO_2_ID,
                status: {
                    privacyStatus: 'private',
                    publishAt: VIDEO_2_PUBLISH,
                    selfDeclaredMadeForKids: false
                }
            }
        });
        console.log(`✅ Video 2 successfully rescheduled!`);

        console.log(`\n=================================================`);
        console.log(`🎉 SUCCESS! Both videos have been successfully rescheduled!`);
        console.log(`=================================================\n`);

    } catch (err) {
        console.error("🔴 Error during rescheduling:", err.message);
    }
}

run().catch(console.error);
