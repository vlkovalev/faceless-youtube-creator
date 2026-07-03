const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');
const TRACKER_FILE = path.join(__dirname, '..', 'metadata', 'uploads_tracker.json');

const VIDEO_1_ID = 'ze6IFb9F0lY';
const VIDEO_2_ID = '9egMNpLFr5w';
const VIDEO_3_ID = 'feTnR0QeeBc';

// Space them out twice a week (Tuesdays and Fridays) at 10:00 AM Denver Time (16:00 UTC)
const VIDEO_1_PUBLISH = '2026-05-26T16:00:00.000Z'; // Tuesday, May 26
const VIDEO_2_PUBLISH = '2026-05-29T16:00:00.000Z'; // Friday, May 29
const VIDEO_3_PUBLISH = '2026-06-02T16:00:00.000Z'; // Tuesday, June 2

async function run() {
    console.log("🔄 Starting YouTube Reschedule All Agent...");

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
        console.log(`\n⏳ Rescheduling Video 1 (ID: ${VIDEO_1_ID}) to Tuesday, May 26: ${VIDEO_1_PUBLISH}...`);
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

        console.log(`\n⏳ Rescheduling Video 2 (ID: ${VIDEO_2_ID}) to Friday, May 29: ${VIDEO_2_PUBLISH}...`);
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

        console.log(`\n⏳ Rescheduling Video 3 (ID: ${VIDEO_3_ID}) to Tuesday, June 2: ${VIDEO_3_PUBLISH}...`);
        await youtube.videos.update({
            part: ['status', 'id'],
            requestBody: {
                id: VIDEO_3_ID,
                status: {
                    privacyStatus: 'private',
                    publishAt: VIDEO_3_PUBLISH,
                    selfDeclaredMadeForKids: false
                }
            }
        });
        console.log(`✅ Video 3 successfully rescheduled!`);

        // Update local database uploads_tracker.json to match these dates!
        if (fs.existsSync(TRACKER_FILE)) {
            const tracker = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf-8'));
            if (tracker.uploaded_files['FINAL_VIDEO_1.mp4']) {
                tracker.uploaded_files['FINAL_VIDEO_1.mp4'].youtube_id = VIDEO_1_ID;
                tracker.uploaded_files['FINAL_VIDEO_1.mp4'].publish_at = VIDEO_1_PUBLISH;
            }
            if (tracker.uploaded_files['FINAL_VIDEO_2.mp4']) {
                tracker.uploaded_files['FINAL_VIDEO_2.mp4'].youtube_id = VIDEO_2_ID;
                tracker.uploaded_files['FINAL_VIDEO_2.mp4'].publish_at = VIDEO_2_PUBLISH;
            }
            // Add Video 3 to tracker
            tracker.uploaded_files['FINAL_VIDEO_3.mp4'] = {
                youtube_id: VIDEO_3_ID,
                uploaded_at: new Date().toISOString(),
                publish_at: VIDEO_3_PUBLISH,
                title: "The Secret Society That Controlled the World's Electricity"
            };
            fs.writeFileSync(TRACKER_FILE, JSON.stringify(tracker, null, 2));
            console.log(`💾 Local uploads tracker successfully updated with new schedule dates!`);
        }

        console.log(`\n=================================================`);
        console.log(`🎉 SUCCESS! All three premium videos rescheduled & cataloged!`);
        console.log(`=================================================\n`);

    } catch (err) {
        console.error("🔴 Error during rescheduling:", err.message);
    }
}

run().catch(console.error);
