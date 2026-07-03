const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
const { REPO_ROOT, SAINTS_ROOT, SAINTS_CREDENTIALS_DIR, resolveSaintsRelative } = require('./channel_paths');

// Load environment variables if present
require('dotenv').config();

// CLI Arguments
const DRY_RUN = process.argv.includes('--dry-run');
const onlyArg = process.argv.find(arg => arg.startsWith('--only=') || arg.startsWith('--video='));
const ONLY_FILENAME = onlyArg ? onlyArg.split('=').slice(1).join('=') : null;
const channelArg = process.argv.find(arg => arg.startsWith('--channel='));
const CHANNEL_PROFILE = channelArg
    ? channelArg.split('=').slice(1).join('=').toLowerCase()
    : (String(ONLY_FILENAME || '').toUpperCase().startsWith('SAINTS_') ? 'saints' : 'corporate');
const privacyArg = process.argv.find(arg => arg.startsWith('--privacy='));
const PRIVACY_OVERRIDE = privacyArg ? privacyArg.split('=').slice(1).join('=').toLowerCase() : null;
const AUTO_APPROVE_PRIVATE = process.argv.includes('--auto-approve-private');
const AUTO_APPROVE_SCHEDULED = process.argv.includes('--auto-approve-scheduled');
const AUTO_DELETE_OLD = process.argv.includes('--auto-delete-old');
const SKIP_QC = process.argv.includes('--skip-qc');
const NO_RESERVE_DRY_RUN = process.argv.includes('--no-reserve-dry-run');
const REPLACE_EXISTING = process.argv.includes('--replace-existing');

// Core Workspace Paths
const WORKSPACE_DIR = REPO_ROOT;
const SAINTS_WORKSPACE_DIR = SAINTS_ROOT;
const READY_DIR = path.join(WORKSPACE_DIR, 'videos', 'ready');
const UPLOADED_DIR = path.join(WORKSPACE_DIR, 'videos', 'uploaded');
const FAILED_DIR = path.join(WORKSPACE_DIR, 'videos', 'failed');
const SAINTS_READY_DIR = path.join(SAINTS_WORKSPACE_DIR, 'videos', 'saints', 'ready');
const SAINTS_UPLOADED_DIR = path.join(SAINTS_WORKSPACE_DIR, 'videos', 'saints', 'uploaded');
const SAINTS_FAILED_DIR = path.join(SAINTS_WORKSPACE_DIR, 'videos', 'saints', 'failed');
const METADATA_DIR = path.join(WORKSPACE_DIR, 'metadata');
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');

const QUEUE_FILE = path.join(METADATA_DIR, 'queue.json');
const TRACKER_FILE = path.join(METADATA_DIR, 'uploads_tracker.json');
const RESERVATIONS_FILE = path.join(METADATA_DIR, 'schedule_reservations.json');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(
    CHANNEL_PROFILE === 'saints' ? SAINTS_CREDENTIALS_DIR : CREDENTIALS_DIR,
    CHANNEL_PROFILE === 'saints' ? 'saints_oauth_tokens.json' : 'oauth_tokens.json'
);

// Initialize folder structure just in case
[READY_DIR, UPLOADED_DIR, FAILED_DIR, SAINTS_READY_DIR, SAINTS_UPLOADED_DIR, SAINTS_FAILED_DIR, CREDENTIALS_DIR, SAINTS_CREDENTIALS_DIR, METADATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

console.log(`=================================================`);
console.log(`🚀 YouTube Local Uploader & Scheduler Agent`);
console.log(`   Workspace: ${WORKSPACE_DIR}`);
console.log(`   Dry-Run Mode: ${DRY_RUN ? '🟢 ON' : '🔴 OFF'}`);
if (ONLY_FILENAME) console.log(`   Queue Filter: ${ONLY_FILENAME}`);
if (PRIVACY_OVERRIDE) console.log(`   Privacy Override: ${PRIVACY_OVERRIDE}`);
console.log(`=================================================\n`);

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
}

function resolveWorkspacePath(candidate) {
    if (!candidate) return null;
    if (path.isAbsolute(candidate)) return candidate;
    const repoPath = path.join(WORKSPACE_DIR, candidate);
    if (fs.existsSync(repoPath)) return repoPath;
    return resolveSaintsRelative(candidate) || repoPath;
}

function isSaintsVideo(videoConfig = {}) {
    return String(videoConfig.channel || '').toLowerCase().includes('saints')
        || String(videoConfig.filename || '').toUpperCase().startsWith('SAINTS_')
        || String(videoConfig.script_id || '').toLowerCase().startsWith('saints');
}

function findMediaPath(filename, explicitSourcePath = null) {
    const candidates = [
        resolveWorkspacePath(explicitSourcePath),
        path.join(SAINTS_READY_DIR, filename),
        path.join(SAINTS_UPLOADED_DIR, filename),
        path.join(READY_DIR, filename),
        path.join(WORKSPACE_DIR, filename),
        path.join(SAINTS_WORKSPACE_DIR, 'videos', 'saints_ready', filename),
        path.join(WORKSPACE_DIR, 'omni_videos', filename),
        path.join(UPLOADED_DIR, filename)
    ].filter(Boolean);

    return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

function inferScriptId(videoConfig) {
    if (videoConfig.script_id) return String(videoConfig.script_id);
    const match = String(videoConfig.filename || '').match(/FINAL_VIDEO_(\d+)/i);
    return match ? match[1] : null;
}

function inferScriptIdFromFilename(filename) {
    const match = String(filename || '').match(/FINAL_VIDEO_(\d+)/i);
    return match ? match[1] : null;
}

function listUploadsForSlot(history, videoConfig) {
    const slotScriptId = inferScriptId(videoConfig);
    const slotTitle = String(videoConfig.title || '').trim();
    return Object.entries(history.uploaded_files || {})
        .filter(([uploadedFilename, record]) => {
            const uploadedScriptId = inferScriptIdFromFilename(uploadedFilename);
            if (slotScriptId && uploadedScriptId && uploadedScriptId === slotScriptId) return true;
            return slotTitle && String(record.title || '').trim() === slotTitle;
        })
        .map(([uploadedFilename, record]) => ({ uploadedFilename, ...record }));
}

function isReplacementUpload(videoConfig) {
    return Boolean(
        REPLACE_EXISTING ||
        videoConfig.replacement_for_uploaded_video ||
        videoConfig.keep_existing_until_verified ||
        normalizeOldVideoIds(videoConfig).length
    );
}

function runReleaseQc(videoConfig) {
    if (SKIP_QC) {
        console.warn('⚠️  Release QC skipped by --skip-qc.');
        return true;
    }
    const scriptId = inferScriptId(videoConfig);
    if (!scriptId) {
        console.error(`🔴 Release QC failed: could not infer script_id from '${videoConfig.filename}'.`);
        return false;
    }

    const qcAgent = require('./qc_agent');
    const report = qcAgent.runQc(scriptId, {
        filename: videoConfig.filename,
        sourcePath: videoConfig.source_path,
        srtFilename: videoConfig.srt_filename,
        srtSourcePath: videoConfig.srt_source_path || videoConfig.caption_source_path,
        thumbnailFilename: videoConfig.thumbnail_filename,
        queueEntry: videoConfig
    });

    if (String(report.qc_status || '').startsWith('failed')) {
        console.error(`🔴 Release QC blocked upload for '${videoConfig.filename}'.`);
        return false;
    }
    console.log(`✅ Release QC passed for '${videoConfig.filename}'.`);
    return true;
}
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

function isAuthError(error) {
    const text = [
        error && error.message,
        error && error.code,
        error && error.response && error.response.data && JSON.stringify(error.response.data)
    ].filter(Boolean).join(' ');
    return /invalid_grant|invalid_client|unauthorized|auth|oauth|token/i.test(text);
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

    const secretsData = readJsonFile(SECRETS_FILE);
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
            existingTokens = readJsonFile(TOKENS_FILE);
        }
        const updatedTokens = { ...existingTokens, ...tokens };
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(updatedTokens, null, 2));
        console.log(`💾 Securely saved refreshed OAuth tokens to client cache.`);
    });

    if (fs.existsSync(TOKENS_FILE)) {
        console.log(`🔑 Loaded cached OAuth tokens.`);
        oauth2Client.setCredentials(readJsonFile(TOKENS_FILE));
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
    return readJsonFile(TRACKER_FILE);
}

function getScheduleReservations() {
    if (!fs.existsSync(RESERVATIONS_FILE)) {
        return { reserved_files: {} };
    }
    return readJsonFile(RESERVATIONS_FILE);
}

function mergeReservationsIntoHistory(history) {
    const reservations = getScheduleReservations();
    for (const [filename, reservation] of Object.entries(reservations.reserved_files || {})) {
        if (!DRY_RUN && reservation.source === 'dry-run') continue;
        if (!history.uploaded_files[filename]) {
            history.uploaded_files[filename] = {
                youtube_id: reservation.youtube_id || `reserved-${filename}`,
                uploaded_at: reservation.reserved_at || new Date().toISOString(),
                publish_at: reservation.publish_at,
                title: reservation.title || filename
            };
        }
    }
    return history;
}

function saveScheduleReservation(filename, publishAt, title) {
    const reservations = getScheduleReservations();
    reservations.reserved_files[filename] = {
        reserved_at: new Date().toISOString(),
        publish_at: publishAt,
        title,
        source: DRY_RUN ? 'dry-run' : 'upload'
    };
    fs.writeFileSync(RESERVATIONS_FILE, JSON.stringify(reservations, null, 2));
}

function saveUploadRecord(filename, videoId, publishAt, title, videoConfig = {}) {
    const history = mergeReservationsIntoHistory(getUploadedHistory());
    const previous = history.uploaded_files[filename];
    history.uploaded_files[filename] = {
        youtube_id: videoId,
        uploaded_at: new Date().toISOString(),
        publish_at: publishAt,
        title: title
    };
    if (videoConfig.replacement_for_uploaded_video) {
        history.uploaded_files[filename].canonical = true;
        history.uploaded_files[filename].status_note = 'CANONICAL replacement upload.';
    }
    if (previous && previous.youtube_id && previous.youtube_id !== videoId) {
        history.uploaded_files[filename].previous_youtube_id = previous.youtube_id;
    }
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(history, null, 2));
    console.log(`💾 Saved upload record for '${filename}' in tracker log.`);
}

// -----------------------------------------------------------------
// 3. Dynamic Scheduling Slots Engine
// -----------------------------------------------------------------
function getZonedParts(date, timezone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || 'America/Denver',
        weekday: 'long',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(date);

    return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function appendDeletionLog(entry) {
    const logFile = path.join(METADATA_DIR, 'upload_deletion_log.json');
    let log = { deletions: [] };
    if (fs.existsSync(logFile)) {
        log = readJsonFile(logFile);
        if (!Array.isArray(log.deletions)) log.deletions = [];
    }
    log.deletions.push({ ...entry, logged_at: new Date().toISOString() });
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
}

function normalizeOldVideoIds(videoConfig) {
    const raw = videoConfig.delete_after_success_ids || videoConfig.delete_old_video_ids || [];
    if (Array.isArray(raw)) return raw.map(String).map(v => v.trim()).filter(Boolean);
    return String(raw).split(',').map(v => v.trim()).filter(Boolean);
}

async function maybeDeleteOldVideos(youtube, videoConfig, newVideoId) {
    const oldVideoIds = normalizeOldVideoIds(videoConfig)
        .filter(oldId => oldId && oldId !== newVideoId);

    if (!oldVideoIds.length) return;

    const mode = videoConfig.delete_after_success_mode || 'manual';
    const approvedByConfig = videoConfig.delete_after_success_approved === true;
    const shouldDelete = mode === 'auto' && (approvedByConfig || AUTO_DELETE_OLD);

    if (!shouldDelete) {
        console.log(`🧹 Old-video cleanup pending. Not deleting because delete_after_success_mode is '${mode}' or approval is missing.`);
        console.log(`   Old IDs waiting: ${oldVideoIds.join(', ')}`);
        appendDeletionLog({
            filename: videoConfig.filename,
            new_video_id: newVideoId,
            old_video_ids: oldVideoIds,
            action: 'skipped_needs_approval',
            reason: 'Set delete_after_success_mode=auto and delete_after_success_approved=true, or run with --auto-delete-old.'
        });
        return;
    }

    for (const oldId of oldVideoIds) {
        try {
            await youtube.videos.delete({ id: oldId });
            console.log(`🧹 Deleted old superseded YouTube upload: ${oldId}`);
            appendDeletionLog({
                filename: videoConfig.filename,
                new_video_id: newVideoId,
                old_video_id: oldId,
                action: 'deleted'
            });
        } catch (deleteErr) {
            console.warn(`⚠️  Could not delete old video ${oldId}: ${deleteErr.message}`);
            appendDeletionLog({
                filename: videoConfig.filename,
                new_video_id: newVideoId,
                old_video_id: oldId,
                action: 'delete_failed',
                error: deleteErr.message
            });
        }
    }
}

function getTimezoneOffsetMs(date, timezone) {
    const parts = getZonedParts(date, timezone);
    const asUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second)
    );
    return asUtc - date.getTime();
}

function zonedTimeToUtc(year, month, day, hours, minutes, timezone) {
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
    const firstPass = new Date(utcGuess.getTime() - getTimezoneOffsetMs(utcGuess, timezone));
    return new Date(utcGuess.getTime() - getTimezoneOffsetMs(firstPass, timezone));
}

function sameZonedDate(a, b, timezone) {
    const aParts = getZonedParts(a, timezone);
    const bParts = getZonedParts(b, timezone);
    return aParts.year === bParts.year && aParts.month === bParts.month && aParts.day === bParts.day;
}

function getNextPublishDate(publishDays, publishTime, timezone, history) {
    const tz = timezone || 'America/Denver';
    const bookedDates = Object.values(history.uploaded_files)
        .map(record => record.publish_at)
        .filter(Boolean)
        .map(date => new Date(date));

    const [hours, minutes] = publishTime.split(':').map(Number);
    const now = new Date();

    // Loop forward up to 365 days to find the next open slot matching the schema calendar
    for (let i = 1; i < 365; i++) {
        const cursor = new Date(now.getTime() + i * 86400000);
        const parts = getZonedParts(cursor, tz);

        if (publishDays.includes(parts.weekday)) {
            const candidateDate = zonedTimeToUtc(
                Number(parts.year),
                Number(parts.month),
                Number(parts.day),
                hours,
                minutes,
                tz
            );

            if (candidateDate <= now) continue;

            // Treat any upload on the same channel-local date as booked.
            const collision = bookedDates.some(booked => {
                return sameZonedDate(booked, candidateDate, tz) || Math.abs(booked.getTime() - candidateDate.getTime()) < 60000;
            });

            if (!collision) {
                return candidateDate.toISOString();
            }
        }
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

    const queue = readJsonFile(QUEUE_FILE);
    const history = mergeReservationsIntoHistory(getUploadedHistory());

    console.log(`📁 Scanning queue. Found ${queue.length} video profiles configured.\n`);

    const oauth2Client = await getOAuth2Client();
    const youtube = oauth2Client ? getYoutubeClient({ version: 'v3', auth: oauth2Client }) : null;

    let uploadCount = 0;

    for (const videoConfig of queue) {
        const { filename, title, description, tags, category_id, playlist_id, status, publish_days, publish_time, timezone, human_approval, srt_filename, thumbnail_filename, publish_at } = videoConfig;
        const effectiveStatus = (PRIVACY_OVERRIDE || status || 'private').toLowerCase();
        const shouldSchedule = effectiveStatus === 'scheduled';

        if (ONLY_FILENAME && filename !== ONLY_FILENAME && filename !== `FINAL_VIDEO_${ONLY_FILENAME}.mp4`) {
            continue;
        }

        console.log(`-------------------------------------------------`);
        console.log(`🎬 Checking Video profile: "${title}"`);
        console.log(`-------------------------------------------------`);

        // Step 1: Duplicate Prevention Check
        const existingSlotUploads = listUploadsForSlot(history, videoConfig);
        if (history.uploaded_files[filename] || existingSlotUploads.length) {
            if (isReplacementUpload(videoConfig)) {
                console.log(`Replacement upload approved for slot '${inferScriptId(videoConfig) || filename}'.`);
                existingSlotUploads.forEach(existing => {
                    console.log(`Existing upload on this slot: ${existing.uploadedFilename} -> ${existing.youtube_id}`);
                });
            } else {
            const existingId = (history.uploaded_files[filename] && history.uploaded_files[filename].youtube_id) || 'unknown';
            console.log(`⏭️  Skipping: Video file '${filename}' has already been uploaded previously (YouTube ID: ${existingId}).`);
            continue;
            }
        }

        // Step 1b: Canonical Slate Guard — prevent duplicate slot scheduling
        // Reads metadata/canonical_slate.json and blocks upload if a canonical entry already
        // exists for the same publish slot and channel. To replace a canonical video, first
        // update canonical_slate.json manually (set old entry canonical=false, superseded_by=<new_id>).
        const CANONICAL_SLATE_FILE = path.join(METADATA_DIR, 'canonical_slate.json');
        if (fs.existsSync(CANONICAL_SLATE_FILE) && publish_at && !DRY_RUN) {
            try {
                const slate = readJsonFile(CANONICAL_SLATE_FILE);
                const targetSlot = new Date(publish_at).toISOString();
                const videoChannel = (videoConfig.channel || 'corporate_shadows').toLowerCase().replace(/\s+/g, '_');
                const channelSlate = slate[videoChannel] || [];
                const conflict = channelSlate.find(entry => {
                    if (!entry.canonical) return false;
                    const entrySlot = new Date(entry.slot).toISOString();
                    return entrySlot === targetSlot;
                });
                if (conflict) {
                    console.error(`🔴 Canonical Slate Guard BLOCKED: "${title}"`);
                    console.error(`   Slot ${targetSlot} on channel '${videoChannel}' already has a canonical entry:`);
                    console.error(`   YouTube ID: ${conflict.youtube_id} — "${conflict.title}"`);
                    console.error(`   To replace it, update metadata/canonical_slate.json first:`);
                    console.error(`   Set the existing entry to canonical:false + superseded_by:<new_id>, then re-run.`);
                    console.error(``);
                    continue;
                }
            } catch (e) {
                console.warn(`⚠️  Could not read canonical_slate.json: ${e.message}. Skipping slate check.`);
            }
        }

        // Step 2: Local Video File Integrity Scans
        // Looks first in videos/ready, then falls back to root workspace folder
        let videoPath = findMediaPath(filename, videoConfig.source_path);

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

        if (!runReleaseQc(videoConfig)) {
            continue;
        }

        // Step 4: Timezone Calendar Slots calculations
        const publishAt = shouldSchedule ? (publish_at || getNextPublishDate(publish_days, publish_time, timezone, history)) : null;
        const localFormatDate = publishAt ? new Date(publishAt).toLocaleString('en-US', { timeZone: timezone || 'America/Denver' }) : null;

        console.log(`✅ File Verified: ${filename} (${(videoStats.size / (1024 * 1024)).toFixed(2)} MB)`);
        if (shouldSchedule) {
            console.log(`📅 Computed Schedule Publish Slot:`);
            console.log(`   ISO Format:  ${publishAt}`);
            console.log(`   Local time:  ${localFormatDate} (${timezone || 'America/Denver'})`);
        } else {
            console.log(`📅 Schedule:     none (${effectiveStatus === 'public' ? 'publish immediately' : 'private draft'})`);
        }
        console.log(`🏷️  Tags:        ${tags.join(', ')}`);
        console.log(`?? Visibility:  ${effectiveStatus.toUpperCase()}`);

        // Step 5: Human Interactive Approvals
        if (human_approval && !DRY_RUN && !(AUTO_APPROVE_PRIVATE && effectiveStatus === 'private') && !(AUTO_APPROVE_SCHEDULED && effectiveStatus === 'scheduled')) {
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
            if (shouldSchedule) console.log(`   Would schedule for: ${publishAt}`);
            else console.log(effectiveStatus === 'public' ? `   Would publish immediately.` : `   Would set private draft visibility.`);
            console.log(`   Would tag:          ${tags.join(', ')}`);
            if (thumbnail_filename) console.log(`   Would upload thumbnail: ${thumbnail_filename}`);
            if (srt_filename) console.log(`   Would upload captions: ${srt_filename}`);
            console.log(`\nDry-run simulation completed successfully.\n`);
            if (!NO_RESERVE_DRY_RUN) {
                history.uploaded_files[filename] = {
                    youtube_id: `dry-run-${filename}`,
                    uploaded_at: new Date().toISOString(),
                    publish_at: publishAt,
                    title: title
                };
                if (shouldSchedule) saveScheduleReservation(filename, publishAt, title);
            } else {
                console.log(`   Dry-run reservation logging skipped by --no-reserve-dry-run.`);
            }
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
                    privacyStatus: shouldSchedule ? 'private' : effectiveStatus, // Scheduled uploads are marked private until publish time
                }
            };

            // Embed schedule times only if designated as scheduled visibility
            if (shouldSchedule) {
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
                    thumbnailPath = path.join(SAINTS_WORKSPACE_DIR, 'assets', thumbnail_filename);
                }
                if (!fs.existsSync(thumbnailPath)) {
                    thumbnailPath = path.join(WORKSPACE_DIR, thumbnail_filename);
                }
                if (!fs.existsSync(thumbnailPath)) {
                    thumbnailPath = path.join(SAINTS_WORKSPACE_DIR, thumbnail_filename);
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
                let srtPath = findMediaPath(srt_filename, videoConfig.srt_source_path || videoConfig.caption_source_path);

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
            saveUploadRecord(filename, videoId, publishAt, title, videoConfig);
            if (shouldSchedule) saveScheduleReservation(filename, publishAt, title);
            await maybeDeleteOldVideos(youtube, videoConfig, videoId);

            // Trigger automatic duplicate cleaner to prune redundant uploads
            try {
                console.log("🧹 Running duplicate cleaner to check for and prune redundant uploads...");
                const { cleanDuplicates } = require('./youtube_duplicate_cleaner');
                await cleanDuplicates();
            } catch (cleanErr) {
                console.warn("⚠️ Warning: Failed to execute automatic duplicate cleaner:", cleanErr.message);
            }

            // Move files from ready/ to uploaded/ to keep workspace pristine
            const destPath = path.join(isSaintsVideo(videoConfig) ? SAINTS_UPLOADED_DIR : UPLOADED_DIR, filename);
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
            
            if (isAuthError(err)) {
                console.error(`YouTube OAuth failed. The video file is valid and was left in place; refresh automation/credentials/oauth_tokens.json, then rerun this upload.`);
                continue;
            }

            // Isolate failed files to ready queue failed/ folder for review
            const failPath = path.join(isSaintsVideo(videoConfig) ? SAINTS_FAILED_DIR : FAILED_DIR, filename);
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
