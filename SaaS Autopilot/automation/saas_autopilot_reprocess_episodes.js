/**
 * saas_autopilot_reprocess_episodes.js — B2B Video Reprocess & Re-upload Utility
 * =====================================================================
 * Identifies episodes 4, 5, 6, and 7 in uploads_tracker.json, deletes them from
 * YouTube using B2B OAuth credentials, cleans up the local slate/tracker files,
 * and leaves them ready to be re-compiled and re-uploaded with mascot visual slides.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const AUTOMATION_DIR = __dirname;
const WORKSPACE_DIR  = path.join(AUTOMATION_DIR, '..');
const CREDENTIALS_DIR = path.join(AUTOMATION_DIR, 'credentials');
const METADATA_DIR   = path.join(WORKSPACE_DIR, 'metadata');

const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_client_secrets.json');
const TOKENS_FILE  = path.join(CREDENTIALS_DIR, 'saas_autopilot_oauth_token.json');
const TRACKER_FILE = path.join(METADATA_DIR, 'uploads_tracker.json');
const CANONICAL_SLATE_FILE = path.join(METADATA_DIR, 'canonical_slate.json');

const TARGET_TOPICS = ['SAAS-004', 'SAAS-005', 'SAAS-006', 'SAAS-007'];

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function getOAuthClient() {
  if (!fs.existsSync(SECRETS_FILE)) {
    throw new Error(`B2B OAuth secrets missing. Save secrets to: ${SECRETS_FILE}`);
  }
  const secrets = readJson(SECRETS_FILE);
  const { client_id, client_secret, redirect_uris } = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKENS_FILE)) {
    const tokens = readJson(TOKENS_FILE);
    oauth2Client.setCredentials(tokens);
    try {
      const refreshed = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(refreshed.credentials);
      writeJson(TOKENS_FILE, refreshed.credentials);
    } catch (e) {
      console.warn('⚠️ Token refresh failed.');
    }
    return oauth2Client;
  }
  throw new Error(`Active OAuth session token not found at: ${TOKENS_FILE}`);
}

async function main() {
  console.log(`\n=============================================================`);
  console.log(`  🗑️ SaaS Autopilot B2B Video Reprocess Utility`);
  console.log(`=============================================================\n`);

  const oauth2Client = await getOAuthClient();
  const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });

  const tracker = readJson(TRACKER_FILE, { uploaded_files: {} });
  const slate = readJson(CANONICAL_SLATE_FILE, { saas_autopilot: [] });

  const filesToReprocess = [];

  for (const filename of Object.keys(tracker.uploaded_files)) {
    const match = filename.match(/^SAAS_(\d+)_FINAL\.mp4$/i);
    if (match) {
      const topicId = `SAAS-${match[1]}`;
      if (TARGET_TOPICS.includes(topicId)) {
        filesToReprocess.push({
          filename,
          topicId,
          youtubeId: tracker.uploaded_files[filename].youtube_id
        });
      }
    }
  }

  if (filesToReprocess.length === 0) {
    console.log('🎉 No target episodes found for reprocessing in uploads_tracker.json.');
    process.exit(0);
  }

  console.log(`📊 Found ${filesToReprocess.length} episodes to delete and reprocess:`);
  filesToReprocess.forEach(f => console.log(`   👉 ${f.topicId} (YouTube ID: ${f.youtubeId})`));

  // 1. Delete videos from YouTube
  for (const file of filesToReprocess) {
    console.log(`\n⏳ Deleting ${file.topicId} (ID: ${file.youtubeId}) from YouTube...`);
    try {
      await youtube.videos.delete({ id: file.youtubeId });
      console.log(`✅ ${file.topicId} successfully deleted!`);
    } catch (err) {
      console.error(`❌ Failed to delete ${file.topicId} from YouTube:`, err.message);
      console.log(`   Proceeding to clean up config metadata anyway...`);
    }

    // 2. Remove from uploads_tracker.json
    delete tracker.uploaded_files[file.filename];

    // 3. Remove from canonical_slate.json
    if (slate.saas_autopilot) {
      slate.saas_autopilot = slate.saas_autopilot.filter(e => e.video_id !== file.topicId);
    }
  }

  // Save updated config files
  writeJson(TRACKER_FILE, tracker);
  writeJson(CANONICAL_SLATE_FILE, slate);

  console.log(`\n💾 Cleaned up local tracking files metadata successfully.`);
  console.log(`🚀 Ready to run the channel scheduler to re-compile and re-upload!`);
}

main().catch(err => {
  console.error('\nFatal Error:', err.message);
  process.exit(1);
});
