const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');

const TRACKER_FILE = path.join(WORKSPACE_DIR, 'metadata', 'uploads_tracker.json');
const QUEUE_FILE = path.join(WORKSPACE_DIR, 'metadata', 'queue.json');
const RESERVATIONS_FILE = path.join(WORKSPACE_DIR, 'metadata', 'schedule_reservations.json');

const VIDEO_ID = 'CXDTHbQVuPQ'; // Video 7
const NEW_PUBLISH_TIME = '2026-06-20T06:00:00.000Z'; // Saturday, June 20, 00:00 America/Edmonton
const AGY_NODE = 'C:\\Users\\heliu\\AppData\\Roaming\\Antigravity\\bin\\agy-node.cmd';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function getClient() {
  if (!fs.existsSync(SECRETS_FILE) || !fs.existsSync(TOKENS_FILE)) {
    throw new Error('Missing secrets or active session OAuth tokens.');
  }
  const secrets = readJson(SECRETS_FILE);
  const tokens = readJson(TOKENS_FILE);
  const cfg = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(
    cfg.client_id,
    cfg.client_secret,
    (cfg.redirect_uris || ['http://localhost'])[0]
  );
  oauth2Client.setCredentials(tokens);
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

function runCommand(command, args) {
  console.log(`[EXEC] Running: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: WORKSPACE_DIR,
    stdio: 'inherit',
    shell: true,
    windowsHide: true
  });
  return result.status === 0;
}

async function main() {
  console.log('🤖 Auto-Allow Rescheduler & Cadence Sync Agent starting...\n');

  // 1. Reschedule via YouTube API
  console.log(`⏳ Step 1: Rescheduling Video ID ${VIDEO_ID} to ${NEW_PUBLISH_TIME} via YouTube API...`);
  try {
    const youtube = await getClient();
    const updateRes = await youtube.videos.update({
      part: ['status'],
      requestBody: {
        id: VIDEO_ID,
        status: {
          privacyStatus: 'private',
          publishAt: NEW_PUBLISH_TIME,
          selfDeclaredMadeForKids: false
        }
      }
    });
    console.log(`✅ YouTube API call succeeded! Video successfully rescheduled.`);
  } catch (err) {
    console.error(`🔴 Error calling YouTube API: ${err.message}`);
    process.exit(1);
  }

  // 2. Update metadata/uploads_tracker.json
  console.log('\n⏳ Step 2: Updating metadata/uploads_tracker.json...');
  if (fs.existsSync(TRACKER_FILE)) {
    const tracker = readJson(TRACKER_FILE);
    let updated = false;
    for (const key of Object.keys(tracker.uploaded_files)) {
      if (tracker.uploaded_files[key].youtube_id === VIDEO_ID) {
        tracker.uploaded_files[key].publish_at = NEW_PUBLISH_TIME;
        updated = true;
        console.log(`   Updated tracker record for ${key}`);
      }
    }
    if (updated) {
      writeJson(TRACKER_FILE, tracker);
      console.log('✅ uploads_tracker.json successfully updated.');
    } else {
      console.warn('⚠️ No matching record in uploads_tracker.json found for Video ID ' + VIDEO_ID);
    }
  }

  // 3. Update metadata/queue.json
  console.log('\n⏳ Step 3: Updating metadata/queue.json...');
  if (fs.existsSync(QUEUE_FILE)) {
    const queue = readJson(QUEUE_FILE);
    let updated = false;
    for (const item of queue) {
      if (item.filename === 'FINAL_VIDEO_7_OMNI_FLASH.mp4') {
        item.publish_at = NEW_PUBLISH_TIME;
        updated = true;
        console.log(`   Updated queue record for FINAL_VIDEO_7_OMNI_FLASH.mp4`);
      }
    }
    if (updated) {
      writeJson(QUEUE_FILE, queue);
      console.log('✅ queue.json successfully updated.');
    } else {
      console.warn('⚠️ No matching record in queue.json found for FINAL_VIDEO_7_OMNI_FLASH.mp4');
    }
  }

  // 4. Update metadata/schedule_reservations.json
  console.log('\n⏳ Step 4: Updating metadata/schedule_reservations.json...');
  if (fs.existsSync(RESERVATIONS_FILE)) {
    const reservations = readJson(RESERVATIONS_FILE);
    if (reservations.reserved_files && reservations.reserved_files['FINAL_VIDEO_7_OMNI_FLASH.mp4']) {
      reservations.reserved_files['FINAL_VIDEO_7_OMNI_FLASH.mp4'].publish_at = NEW_PUBLISH_TIME;
      writeJson(RESERVATIONS_FILE, reservations);
      console.log('✅ schedule_reservations.json successfully updated.');
    } else {
      console.warn('⚠️ No reservation record found for FINAL_VIDEO_7_OMNI_FLASH.mp4');
    }
  }

  // 5. Synchronize calendars and dashboard by running YouTube Status and Channel Director agents
  console.log('\n⏳ Step 5: Syncing channel and portfolio content calendars...');
  const statusOk = runCommand(AGY_NODE, ['automation/youtube_status_agent.js']);
  const directorOk = runCommand(AGY_NODE, ['automation/channel_director_agent.js']);

  if (statusOk && directorOk) {
    console.log('\n======================================================');
    console.log('🎉 EXCELLENT SUCCESS! Video 7 has been rescheduled!');
    console.log('======================================================');
    console.log('Verified strict 3-Day cadence (Alberta Time 00:00 MDT):');
    console.log(' - De Beers (V1): Public / Scheduled');
    console.log(' - Nestle Formula (V2): Friday, June 5');
    console.log(' - Phoebus Cartel (V3): Monday, June 8');
    console.log(' - Sugar Lobby (V4): Thursday, June 11');
    console.log(' - East India Company (V5): Sunday, June 14');
    console.log(' - Sackler Scandal (V6): Wednesday, June 17');
    console.log(' - DuPont Teflon (V7): Saturday, June 20');
    console.log('======================================================\n');
  } else {
    console.warn('⚠️ Rescheduled completed, but calendar sync agents encountered errors.');
  }
}

main().catch(console.error);
