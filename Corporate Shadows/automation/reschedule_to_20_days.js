const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
const { spawnSync } = require('child_process');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'oauth_tokens.json');

const TRACKER_FILE = path.join(WORKSPACE_DIR, 'metadata', 'uploads_tracker.json');
const QUEUE_FILE = path.join(WORKSPACE_DIR, 'metadata', 'queue.json');
const RESERVATIONS_FILE = path.join(WORKSPACE_DIR, 'metadata', 'schedule_reservations.json');
const CALENDAR_FILE = path.join(WORKSPACE_DIR, 'metadata', 'content_calendar.json');

const AGY_NODE = process.execPath;

// New schedule dates spaced 20 days apart starting from Video 1 (published June 2, 2026)
// Spaced exactly at 20-day intervals (approx. 1.5 videos/month) to stay under ElevenLabs free limits
const NEW_SCHEDULES = {
  'gPhHnEjKaP8': '2026-06-22T06:00:00.000Z', // Video 2 (Nestle)
  'PxBdlAu-hvY': '2026-07-12T06:00:00.000Z', // Video 3 (Phoebus Cartel)
  '-Tt_ijOCCRI': '2026-08-01T06:00:00.000Z', // Video 4 (Sugar Lobby)
  'ZM0fbdddYZA': '2026-08-21T06:00:00.000Z', // Video 5 (East India Company)
  'nlOlrWsHc9w': '2026-09-10T06:00:00.000Z', // Video 6 (Toxic Empire)
  'CXDTHbQVuPQ': '2026-09-30T06:00:00.000Z', // Video 7 (Silent Killer/Teflon)
  '1TkYFsLq8QM': '2026-10-20T06:00:00.000Z'  // Video 8 (Monsanto Seeds)
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function getYoutube() {
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
    shell: false,
    windowsHide: true
  });
  return result.status === 0;
}

async function main() {
  console.log('🔄 Starting YouTube Rescheduling to 20-Day Cadence...\n');

  // 1. Update YouTube API
  const youtube = await getYoutube();
  for (const [videoId, newTime] of Object.entries(NEW_SCHEDULES)) {
    console.log(`⏳ Rescheduling Video ID ${videoId} to ${newTime} on YouTube...`);
    try {
      await youtube.videos.update({
        part: ['status'],
        requestBody: {
          id: videoId,
          status: {
            privacyStatus: 'private',
            publishAt: newTime,
            selfDeclaredMadeForKids: false
          }
        }
      });
      console.log(`✅ YouTube ID ${videoId} rescheduled successfully!`);
    } catch (err) {
      console.error(`🔴 Error updating YouTube ID ${videoId}: ${err.message}`);
    }
  }

  // 2. Load tracker and build filename-to-date map
  console.log('\n⏳ Updating metadata/uploads_tracker.json...');
  const tracker = readJson(TRACKER_FILE);
  const filenameToDate = {};
  if (tracker && tracker.uploaded_files) {
    for (const [filename, info] of Object.entries(tracker.uploaded_files)) {
      if (NEW_SCHEDULES[info.youtube_id]) {
        const newTime = NEW_SCHEDULES[info.youtube_id];
        info.publish_at = newTime;
        filenameToDate[filename] = newTime;
        console.log(`   Updated tracker: ${filename} -> ${newTime}`);
      }
    }
    writeJson(TRACKER_FILE, tracker);
    console.log('✅ uploads_tracker.json updated successfully.');
  }

  // 3. Update queue.json
  console.log('\n⏳ Updating metadata/queue.json...');
  const queue = readJson(QUEUE_FILE);
  if (queue) {
    let updatedCount = 0;
    for (const item of queue) {
      // Direct filename check or keyword fallback
      if (filenameToDate[item.filename]) {
        item.publish_at = filenameToDate[item.filename];
        updatedCount++;
        console.log(`   Updated queue item: ${item.filename} -> ${item.publish_at}`);
      } else {
        // Fallback checks by checking if it contains video number
        const m = item.filename.match(/FINAL_VIDEO_(\d+)/);
        if (m) {
          const videoNum = m[1];
          // Find if there is an uploaded file in tracker for this video number that has a new schedule
          for (const [filename, info] of Object.entries(tracker.uploaded_files)) {
            if (filename.includes(`VIDEO_${videoNum}`) && NEW_SCHEDULES[info.youtube_id]) {
              item.publish_at = NEW_SCHEDULES[info.youtube_id];
              updatedCount++;
              console.log(`   Updated queue item (fallback by video num ${videoNum}): ${item.filename} -> ${item.publish_at}`);
              break;
            }
          }
        }
      }
    }
    writeJson(QUEUE_FILE, queue);
    console.log(`✅ queue.json updated successfully (${updatedCount} items).`);
  }

  // 4. Update schedule_reservations.json
  console.log('\n⏳ Updating metadata/schedule_reservations.json...');
  const reservations = readJson(RESERVATIONS_FILE);
  if (reservations && reservations.reserved_files) {
    let updatedCount = 0;
    for (const filename of Object.keys(reservations.reserved_files)) {
      if (filenameToDate[filename]) {
        reservations.reserved_files[filename].publish_at = filenameToDate[filename];
        updatedCount++;
        console.log(`   Updated reservation: ${filename} -> ${filenameToDate[filename]}`);
      }
    }
    writeJson(RESERVATIONS_FILE, reservations);
    console.log(`✅ schedule_reservations.json updated successfully (${updatedCount} items).`);
  }

  // 5. Update content_calendar.json
  console.log('\n⏳ Updating metadata/content_calendar.json...');
  const calendar = readJson(CALENDAR_FILE);
  if (calendar) {
    let updatedCount = 0;
    for (const item of calendar) {
      const vidId = item.youtube_video_id;
      if (NEW_SCHEDULES[vidId]) {
        item.assigned_publish_date = NEW_SCHEDULES[vidId];
        item.publish_status = 'scheduled';
        updatedCount++;
        console.log(`   Updated content calendar item: VID-000${item.script_id || ''} (${item.title}) -> ${NEW_SCHEDULES[vidId]}`);
      }
    }
    writeJson(CALENDAR_FILE, calendar);
    console.log(`✅ content_calendar.json updated successfully (${updatedCount} items).`);
  }

  // 6. Run Status & PM Sync Agents
  console.log('\n⏳ Syncing status and calendars across dashboard...');
  runCommand(AGY_NODE, ['automation/youtube_status_agent.js']);
  runCommand(AGY_NODE, ['automation/pm_agent.js']);
  runCommand(AGY_NODE, ['automation/channel_director_agent.js']);

  console.log('\n🎉 Rescheduling completely finished and synced!');
}

main().catch(console.error);
