const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

// Load environment variables if present
require('dotenv').config();

// CLI Arguments
const DRY_RUN = process.argv.includes('--dry-run');

// Core Workspace Paths
const WORKSPACE_DIR = path.join(__dirname, '..');
const READY_DIR = path.join(WORKSPACE_DIR, 'videos', 'ready');
const UPLOADED_DIR = path.join(WORKSPACE_DIR, 'videos', 'uploaded');
const FAILED_DIR = path.join(WORKSPACE_DIR, 'videos', 'failed');
const METADATA_DIR = path.join(WORKSPACE_DIR, 'metadata');
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');

const QUEUE_FILE = path.join(METADATA_DIR, 'queue.json');
const TRACKER_FILE = path.join(METADATA_DIR, 'uploads_tracker.json');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');

// Initialize folder structure just in case
[READY_DIR, UPLOADED_DIR, FAILED_DIR, CREDENTIALS_DIR, METADATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

console.log(`=================================================`);
console.log(`🚀 YouTube Local Uploader & Scheduler Agent`);
console.log(`   Workspace: ${WORKSPACE_DIR}`);
console.log(`   Dry-Run Mode: ${DRY_RUN ? '🟢 ON' : '🔴 OFF'}`);
console.log(`=================================================\n`);

// Helper function to ask CLI questions
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

// -----------------------------------------------------------------
// 1. Google OAuth 2.0 Authentication Client Setup
// -----------------------------------------------------------------
async function getOAuth2Client() {
    if (DRY_RUN) return null;

    if (!fs.existsSync(SECRETS_FILE)) {
        console.error(`🔴 Error: Missing 'client_secrets.json' in:`);
        console.error(`   ${SECRETS_FILE}`);
        console.error(`\nPlease follow Phase 2 of the implementation plan to download your credentials from Google Cloud Console.`);
        process.exit(1);
    }

    const secretsData = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
    const webOrInstalled = secretsData.installed || secretsData.web;
    if (!webOrInstalled) {
        console.error(`🔴 Error: Invalid client_secrets.json format. Make sure it contains web or installed credentials.`);
        process.exit(1);
    }

    const { client_id, client_secret, redirect_uris } = webOrInstalled;
    const redirectUri = redirect_uris[0] || 'http://localhost:3000';

    const oauth2Client = new OAuth2Client(client_id, client_secret, redirectUri);

    // Set Token Refresh Handler to automatically cache updated tokens
    oauth2Client.on('tokens', (tokens) => {
        let existingTokens = {};
        if (fs.existsSync(TOKENS_FILE)) {
            existingTokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
        }
        const updatedTokens = { ...existingTokens, ...tokens };
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(updatedTokens, null, 2));
        console.log(`💾 Securely saved refreshed OAuth tokens to client cache.`);
    });

    if (fs.existsSync(TOKENS_FILE)) {
        console.log(`🔑 Loaded cached OAuth tokens.`);
        oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8')));
        return oauth2Client;
    }

    // Interactive One-Time Browser Authentication callback
    console.log(`🔑 No cached OAuth tokens found. Initiating one-time browser login flow...`);
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/youtube.force-ssl'
        ],
        prompt: 'consent'
    });

    console.log(`\n=================================================`);
    console.log(`👉 Please open the following URL in your default browser to authorize your channel:`);
    console.log(`\n${authUrl}\n`);
    console.log(`=================================================\n`);

    const authCode = await askQuestion('👉 After authorizing, paste the returned callback URL authorization code here: ');
    if (!authCode || authCode.trim() === '') {
        console.error('🔴 Error: Invalid authorization code.');
        process.exit(1);
    }

    try {
        const { tokens } = await oauth2Client.getToken(authCode.trim());
        oauth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
        console.log(`\n🟢 Authentication Success! Saved secure credentials to:`);
        console.log(`   ${TOKENS_FILE}\n`);
        return oauth2Client;
    } catch (err) {
        console.error('🔴 Error retrieving OAuth access token:', err.message);
        process.exit(1);
    }
}

// -----------------------------------------------------------------
// 2. Database Tracking & History Helpers
// -----------------------------------------------------------------
function getUploadedHistory() {
    if (!fs.existsSync(TRACKER_FILE)) {
        return { uploaded_files: {} };
    }
    return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf-8'));
}

function saveUploadRecord(filename, videoId, publishAt, title) {
    const history = getUploadedHistory();
    history.uploaded_files[filename] = {
        youtube_id: videoId,
        uploaded_at: new Date().toISOString(),
        publish_at: publishAt,
        title: title
    };
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(history, null, 2));
    console.log(`💾 Saved upload record for '${filename}' in tracker log.`);
}

// -----------------------------------------------------------------
// 3. Dynamic Scheduling Slots Engine
// -----------------------------------------------------------------
function getNextPublishDate(publishDays, publishTime, timezone, history) {
    // Collect all future publishing dates already booked to prevent collision
    const bookedDates = Object.values(history.uploaded_files).map(record => record.publish_at);

    const [hours, minutes] = publishTime.split(':').map(Number);
    let candidateDate = new Date();
    candidateDate.setSeconds(0, 0);

    // Calculate tomorrow as the earliest possible upload target to be safe
    candidateDate.setDate(candidateDate.getDate() + 1);

    const dayNameMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Loop forward up to 365 days to find the next open slot matching the schema calendar
    for (let i = 0; i < 365; i++) {
        const currentDayName = dayNameMap[candidateDate.getDay()];
        
        if (publishDays.includes(currentDayName)) {
            // Set designated schedule hour/minute
            candidateDate.setHours(hours, minutes, 0, 0);

            // Construct ISO string
            const isoString = candidateDate.toISOString();

            // Check if this slot is already occupied in our history
            const collision = bookedDates.some(booked => {
                const bDate = new Date(booked);
                return Math.abs(bDate.getTime() - candidateDate.getTime()) < 60000; // Match within 1 minute
            });

            if (!collision) {
                return isoString;
            }
        }
        candidateDate.setDate(candidateDate.getDate() + 1);
    }
    return new Date(Date.now() + 86400000 * 2).toISOString(); // fallback to 2 days out
}

// -----------------------------------------------------------------
// 4. Queue Scan & Metadata Validation Engine
// -----------------------------------------------------------------
async function run() {
    if (!fs.existsSync(QUEUE_FILE)) {
        console.error(`🔴 Error: Upload queue configuration file not found:`);
        console.error(`   ${QUEUE_FILE}`);
        console.error(`\nPlease create this metadata list to define your videos.`);
        process.exit(1);
    }

    const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
    const history = getUploadedHistory();

    console.log(`📁 Scanning queue. Found ${queue.length} video profiles configured.\n`);

    const oauth2Client = await getOAuth2Client();
    const youtube = oauth2Client ? getYoutubeClient({ version: 'v3', auth: oauth2Client }) : null;

    let uploadCount = 0;

    for (const videoConfig of queue) {
        const { filename, title, description, tags, category_id, playlist_id, status, publish_days, publish_time, timezone, human_approval, srt_filename, thumbnail_filename } = videoConfig;

        console.log(`-------------------------------------------------`);
        console.log(`🎬 Checking Video profile: "${title}"`);
        console.log(`-------------------------------------------------`);

        // Step 1: Duplicate Prevention Check
        if (history.uploaded_files[filename]) {
            console.log(`⏭️  Skipping: Video file '${filename}' has already been uploaded previously (YouTube ID: ${history.uploaded_files[filename].youtube_id}).`);
            continue;
        }

        // Step 2: Local Video File Integrity Scans
        // Looks first in videos/ready, then falls back to root workspace folder
        let videoPath = path.join(READY_DIR, filename);
        if (!fs.existsSync(videoPath)) {
            videoPath = path.join(WORKSPACE_DIR, filename);
        }

        if (!fs.existsSync(videoPath)) {
            console.warn(`⚠️  Warning: Local video file '${filename}' was not found in 'videos/ready/' or root workspace folder.`);
            console.warn(`   Skipping profile for now.\n`);
            continue;
        }

        const videoStats = fs.statSync(videoPath);
        if (videoStats.size === 0) {
            console.error(`🔴 Error: Local video file '${filename}' is empty (0 bytes). Skipping failed asset.`);
            continue;
        }

        // Step 3: Local Metadata Validation Boundary Checks
        if (title.length > 100) {
            console.error(`🔴 Error: Title exceeds YouTube limit of 100 characters (${title.length} chars). Skipping.`);
            continue;
        }
        if (description.length > 5000) {
            console.error(`🔴 Error: Description exceeds YouTube limit of 5000 characters (${description.length} chars). Skipping.`);
            continue;
        }

        // Step 4: Timezone Calendar Slots calculations
        const publishAt = getNextPublishDate(publish_days, publish_time, timezone, history);
        const localFormatDate = new Date(publishAt).toLocaleString('en-US', { timeZone: timezone || 'America/Denver' });

        console.log(`✅ File Verified: ${filename} (${(videoStats.size / (1024 * 1024)).toFixed(2)} MB)`);
        console.log(`📅 Computed Schedule Publish Slot:`);
        console.log(`   ISO Format:  ${publishAt}`);
        console.log(`   Local time:  ${localFormatDate} (${timezone || 'America/Denver'})`);
        console.log(`🏷️  Tags:        ${tags.join(', ')}`);
        console.log(`📺 Visibility:  ${status.toUpperCase()}`);

        // Step 5: Human Interactive Approvals
        if (human_approval) {
            const confirm = await askQuestion(`\n❓ Confirm upload of this video profile to YouTube? (Y/N): `);
            if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
                console.log(`⏭️  Skipped: User rejected approval for '${filename}'.\n`);
                continue;
            }
        }

        // Step 6: Trigger Real or Dry-Run simulated upload
        if (DRY_RUN) {
            console.log(`\n🟢 [SIMULATED SUCCESS] (Dry-Run Mode)`);
            console.log(`   Would upload:       ${filename}`);
            console.log(`   Would schedule for: ${publishAt}`);
            console.log(`   Would tag:          ${tags.join(', ')}`);
            if (thumbnail_filename) console.log(`   Would upload thumbnail: ${thumbnail_filename}`);
            if (srt_filename) console.log(`   Would upload captions: ${srt_filename}`);
            console.log(`\nDry-run simulation completed successfully.\n`);
            uploadCount++;
            continue;
        }

        try {
            console.log(`\n⏳ Streaming video upload to YouTube Data API (this may take a few minutes)...`);
            
            const requestBody = {
                snippet: {
                    title: title,
                    description: description,
                    tags: tags,
                    categoryId: category_id || '27' // Default to Education
                },
                status: {
                    privacyStatus: status === 'scheduled' ? 'private' : status, // Scheduled uploads are marked private until publish time
                }
            };

            // Embed schedule times only if designated as scheduled visibility
            if (status === 'scheduled') {
                requestBody.status.publishAt = publishAt;
                requestBody.status.selfDeclaredMadeForKids = false;
            }

            const media = {
                body: fs.createReadStream(videoPath)
            };

            // Stream chunked video upload
            const response = await youtube.videos.insert({
                part: ['snippet', 'status'],
                requestBody: requestBody,
                media: media
            });

            const videoId = response.data.id;
            const liveUrl = `https://youtu.be/${videoId}`;

            console.log(`\n=================================================`);
            console.log(`🟢 SUCCESS! Video has been uploaded successfully!`);
            console.log(`   YouTube Video ID: ${videoId}`);
            console.log(`   URL:              ${liveUrl}`);
            console.log(`=================================================\n`);

            // Step 7: Upload Custom Thumbnail (Wrapped in try-catch in case channel lacks phone verification)
            try {
                let thumbnailPath = path.join(WORKSPACE_DIR, 'assets', thumbnail_filename);
                if (!fs.existsSync(thumbnailPath)) {
                    thumbnailPath = path.join(WORKSPACE_DIR, thumbnail_filename);
                }

                if (fs.existsSync(thumbnailPath)) {
                    console.log(`⏳ Uploading custom thumbnail: ${thumbnail_filename}...`);
                    await youtube.thumbnails.set({
                        videoId: videoId,
                        media: {
                            body: fs.createReadStream(thumbnailPath)
                        }
                    });
                    console.log(`✅ Custom thumbnail uploaded successfully.`);
                } else if (thumbnail_filename) {
                    console.warn(`⚠️  Warning: Thumbnail file '${thumbnail_filename}' not found at:`);
                    console.warn(`   ${thumbnailPath}. Skipping thumbnail attachment.`);
                }
            } catch (thumbErr) {
                console.warn(`\n⚠️  Warning: Failed to upload custom thumbnail:`, thumbErr.message);
                console.warn(`   (Note: Custom thumbnails require phone number verification in your YouTube Studio settings!)`);
                console.warn(`   Continuing upload flow...\n`);
            }

            // Step 8: Upload Soft Subtitles (Wrapped in try-catch to ensure robustness)
            try {
                let srtPath = path.join(WORKSPACE_DIR, srt_filename);
                if (!fs.existsSync(srtPath)) {
                    srtPath = path.join(WORKSPACE_DIR, 'assets', srt_filename);
                }

                if (fs.existsSync(srtPath)) {
                    console.log(`⏳ Uploading soft captions: ${srt_filename}...`);
                    await youtube.captions.insert({
                        part: ['snippet'],
                        requestBody: {
                            snippet: {
                                videoId: videoId,
                                language: 'en',
                                name: 'English Captions (Dynamic CC)',
                                isDraft: false
                            }
                        },
                        media: {
                            body: fs.createReadStream(srtPath),
                            mimeType: 'text/srt'
                        }
                    });
                    console.log(`✅ Soft captions uploaded successfully.`);
                } else if (srt_filename) {
                    console.warn(`⚠️  Warning: Subtitle file '${srt_filename}' not found at:`);
                    console.warn(`   ${srtPath}. Skipping subtitle attachment.`);
                }
            } catch (srtErr) {
                console.warn(`\n⚠️  Warning: Failed to upload soft subtitles:`, srtErr.message);
                console.warn(`   Continuing upload flow...\n`);
            }

            // Step 9: Save status and archive video files
            saveUploadRecord(filename, videoId, publishAt, title);

            // Move files from ready/ to uploaded/ to keep workspace pristine
            const destPath = path.join(UPLOADED_DIR, filename);
            try {
                fs.renameSync(videoPath, destPath);
                console.log(`📦 Moved local video file to: ${destPath}`);
            } catch (err) {
                console.warn(`⚠️  Could not move file to uploaded/ folder: ${err.message}. Keeping in place.`);
            }

            uploadCount++;
            console.log(`\n🎉 Upload completed successfully for profile!\n`);

        } catch (err) {
            console.error(`🔴 Error uploading video:`, err.message);
            
            // Isolate failed files to ready queue failed/ folder for review
            const failPath = path.join(FAILED_DIR, filename);
            try {
                fs.renameSync(videoPath, failPath);
                console.log(`📦 Moved failed video file to isolation: ${failPath}`);
            } catch (moveErr) {
                console.warn(`⚠️  Could not move failed video to failed/ folder.`);
            }
        }
    }

    console.log(`=================================================`);
    console.log(`🏁 Uploader Agent finished processing queue.`);
    console.log(`   Successfully processed: ${uploadCount} videos.`);
    console.log(`=================================================`);
}

run().catch(console.error);
