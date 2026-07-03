/**
 * SaaS Autopilot Publisher Agent
 * ========================
 * Uploads a completed SaaS Autopilot video to the SaaS Autopilot YouTube channel
 * (separate OAuth from Corporate Shadows and Saints).
 *
 * Usage:
 *   node automation/saas_autopilot_publisher_agent.js --topic SAAS-001
 *   node automation/saas_autopilot_publisher_agent.js --topic SAAS-001 --dry-run
 *   node automation/saas_autopilot_publisher_agent.js --topic SAAS-001 --publish-at "2026-08-06T06:00:00Z"
 *
 * Requires:
 *   - automation/credentials/saas_autopilot_oauth_token.json (separate from CS OAuth)
 *   - automation/credentials/saas_autopilot_client_secrets.json
 *   - videos/saas_autopilot/SAAS_001_FINAL.mp4
 *   - scripts/saas_autopilot/saas_001_data.json (for title, description, tags)
 *
 * Output:
 *   - Video uploaded to SaaS Autopilot YouTube channel
 *   - Entry added to metadata/uploads_tracker.json
 *   - Entry added to metadata/canonical_slate.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');
const url  = require('url');
const { spawnSync } = require('child_process');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
const { openUrlHidden } = require('./open_url_hidden');
const { assertChannelNotOnHold } = require('./channel_hold_guard');

const WORKSPACE_DIR  = path.join(__dirname, '..');
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SCRIPTS_DIR    = path.join(WORKSPACE_DIR, 'scripts', 'saas_autopilot');
const VIDEOS_DIR     = path.join(WORKSPACE_DIR, 'videos', 'saas_autopilot');
const METADATA_DIR   = path.join(WORKSPACE_DIR, 'metadata');

// ── IMPORTANT: SaaS Autopilot uses its own OAuth files — never the CS or Saints tokens ──
const SAAS_AUTOPILOT_SECRETS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_client_secrets.json');
const SAAS_AUTOPILOT_TOKENS_FILE  = path.join(CREDENTIALS_DIR, 'saas_autopilot_oauth_token.json');
const EXPECTED_CHANNEL_TITLE = process.env.SAAS_AUTOPILOT_YOUTUBE_CHANNEL_TITLE || 'SaaS Autopilot';
const EXPECTED_CHANNEL_ID = process.env.SAAS_AUTOPILOT_YOUTUBE_CHANNEL_ID || '';

const TRACKER_FILE        = path.join(METADATA_DIR, 'uploads_tracker.json');
const CANONICAL_SLATE_FILE = path.join(METADATA_DIR, 'canonical_slate.json');
const DUPLICATE_CLEANUP_REPORT_FILE = path.join(METADATA_DIR, 'saas_autopilot_duplicate_cleanup_report.json');
const PILOT_RELEASE_GATE_FILE = path.join(METADATA_DIR, 'pilot_release_gate.json');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const TOPIC_ID   = (args.topic || args.t || '').toUpperCase();
const DRY_RUN    = args['dry-run'] || false;
const PUBLISH_AT = args['publish-at'] || null; // ISO8601 UTC string

assertChannelNotOnHold('publisher/upload action');

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitizeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function runQaGate() {
  const qaScript = path.join(__dirname, 'saas_autopilot_qa_agent.js');
  const result = spawnSync(process.execPath, [qaScript, '--topic', TOPIC_ID], {
    cwd: WORKSPACE_DIR,
    stdio: 'inherit',
    shell: false,
    windowsHide: true
  });

  if (result.status !== 0) {
    throw new Error(`QA/QC gate failed for ${TOPIC_ID}. Upload blocked.`);
  }
}

function assertPilotReleaseGate() {
  const gate = readJson(PILOT_RELEASE_GATE_FILE, { active: true, pilot_topic_id: null, status: 'awaiting_selection' });
  if (!gate.active || gate.status === 'approved') return;
  if (!gate.pilot_topic_id) {
    throw new Error('Pilot release gate is active but no pilot topic has been selected. Upload blocked.');
  }
  if (String(gate.pilot_topic_id).toUpperCase() !== TOPIC_ID) {
    throw new Error(`Pilot ${gate.pilot_topic_id} must be approved before uploading ${TOPIC_ID}.`);
  }
}

async function getOAuthClient() {
  if (!fs.existsSync(SAAS_AUTOPILOT_SECRETS_FILE)) {
    throw new Error(
      `SaaS Autopilot OAuth secrets not found at ${SAAS_AUTOPILOT_SECRETS_FILE}\n` +
      `  1. Go to Google Cloud Console → Credentials → Create OAuth 2.0 Client ID\n` +
      `  2. Download as JSON → save to automation/credentials/saas_autopilot_client_secrets.json\n` +
      `  3. Run this script once to complete the OAuth flow`
    );
  }

  const secrets = readJson(SAAS_AUTOPILOT_SECRETS_FILE);
  const { client_id, client_secret, redirect_uris } = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(SAAS_AUTOPILOT_TOKENS_FILE)) {
    const tokens = readJson(SAAS_AUTOPILOT_TOKENS_FILE);
    oauth2Client.setCredentials(tokens);
    try {
      const refreshed = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(refreshed.credentials);
      writeJson(SAAS_AUTOPILOT_TOKENS_FILE, refreshed.credentials);
    } catch (e) {
      console.warn('⚠️  Token refresh failed — re-auth may be needed.');
    }
    return oauth2Client;
  }

  // First-time auth flow with automated browser capture
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube'
    ]
  });
  console.log('\n🔐 SaaS Autopilot OAuth — First-Time Setup');
  console.log('   Opening your default browser to authorize the app...');
  console.log(`   If it doesn't open automatically, visit this URL:`);
  console.log(`\n   ${authUrl}\n`);
  
  // Open default browser without flashing a command window.
  openUrlHidden(authUrl);

  // Start temporary HTTP server on port 3000 to capture the code
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);
      if (parsedUrl.pathname === '/oauth2callback') {
        const authCode = parsedUrl.query.code;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 50px; background-color: #0d1117; color: #f0f6fc;">
              <h1 style="color: #3fb950;">✅ Authentication Successful!</h1>
              <p>You can close this browser tab now. The publisher will continue running automatically in your console.</p>
            </body>
          </html>
        `);
        server.close();
        resolve(authCode);
      }
    });
    server.listen(3000);
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  writeJson(SAAS_AUTOPILOT_TOKENS_FILE, tokens);
  console.log('✅ SaaS Autopilot OAuth token saved.\n');
  return oauth2Client;
}

async function uploadVideo(oauth2Client, videoPath, metadata) {
  const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });
  await verifyAuthenticatedChannel(youtube);

  const resource = {
    snippet: {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      categoryId: '26' // How-to & Style
    },
    status: {
      privacyStatus: PUBLISH_AT ? 'private' : 'private',
      publishAt: PUBLISH_AT || undefined,
      selfDeclaredMadeForKids: false
    }
  };

  if (PUBLISH_AT) {
    resource.status.privacyStatus = 'private';
    resource.status.publishAt = PUBLISH_AT;
  }

  console.log(`📤 Uploading ${path.basename(videoPath)}...`);
  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: resource,
    media: {
      mimeType: 'video/mp4',
      body: fs.createReadStream(videoPath)
    }
  });

  return response.data;
}

async function deleteSupersededUploads(oauth2Client, duplicateUploads, canonicalYoutubeId) {
  const duplicateIds = [...new Set((duplicateUploads || [])
    .map(item => item && item.youtube_id)
    .filter(id => id && id !== canonicalYoutubeId))];

  const report = {
    checked_at: new Date().toISOString(),
    topic_id: TOPIC_ID,
    canonical_youtube_id: canonicalYoutubeId,
    duplicate_ids: duplicateIds,
    results: [],
    passed: true
  };

  if (!duplicateIds.length) {
    writeJson(DUPLICATE_CLEANUP_REPORT_FILE, report);
    console.log('✅ Duplicate cleanup: no superseded YouTube uploads found for this topic.');
    return report;
  }

  const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });
  await verifyAuthenticatedChannel(youtube);

  console.log(`\n🧹 Duplicate cleanup hard rule: deleting ${duplicateIds.length} superseded upload(s)...`);
  for (const id of duplicateIds) {
    try {
      await youtube.videos.delete({ id });
      report.results.push({
        youtube_id: id,
        deleted: true,
        already_absent: false,
        error: null
      });
      console.log(`   ✅ Deleted duplicate upload: ${id}`);
    } catch (err) {
      const status = err && (err.code || err.status || err.response?.status);
      const alreadyAbsent = Number(status) === 404;
      report.results.push({
        youtube_id: id,
        deleted: alreadyAbsent ? false : false,
        already_absent: alreadyAbsent,
        error: alreadyAbsent ? null : (err.message || String(err))
      });
      if (alreadyAbsent) {
        console.log(`   ✅ Duplicate already absent from channel: ${id}`);
      } else {
        report.passed = false;
        console.error(`   ❌ Failed to delete duplicate ${id}: ${err.message || err}`);
      }
    }
  }

  report.passed = report.results.every(item => item.deleted || item.already_absent);
  writeJson(DUPLICATE_CLEANUP_REPORT_FILE, report);

  if (!report.passed) {
    throw new Error(`Duplicate cleanup hard rule failed. Report: ${DUPLICATE_CLEANUP_REPORT_FILE}`);
  }

  return report;
}

async function verifyAuthenticatedChannel(youtube) {
  const res = await youtube.channels.list({
    part: ['snippet'],
    mine: true
  });
  const channel = res.data.items && res.data.items[0];
  if (!channel) {
    throw new Error('OAuth succeeded, but YouTube returned no channel for this token.');
  }

  const actualTitle = channel.snippet && channel.snippet.title;
  const idOk = EXPECTED_CHANNEL_ID ? channel.id === EXPECTED_CHANNEL_ID : true;
  const titleOk = EXPECTED_CHANNEL_TITLE
    ? String(actualTitle || '').toLowerCase() === EXPECTED_CHANNEL_TITLE.toLowerCase()
    : true;

  if (!idOk || !titleOk) {
    throw new Error(
      `Channel guard blocked SaaS Autopilot upload. Expected ${EXPECTED_CHANNEL_TITLE}` +
      `${EXPECTED_CHANNEL_ID ? ` (${EXPECTED_CHANNEL_ID})` : ''}, ` +
      `but OAuth token is for '${actualTitle}' (${channel.id}).`
    );
  }

  console.log(`✅ SaaS Autopilot channel guard verified: ${actualTitle} (${channel.id})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!TOPIC_ID) {
    console.error('❌ Error: --topic is required.');
    process.exit(1);
  }

  const scriptId   = sanitizeId(TOPIC_ID);
  const scriptPath = path.join(SCRIPTS_DIR, `${scriptId}_data.json`);
  const videoPath  = path.join(VIDEOS_DIR, `${TOPIC_ID.replace('-', '_')}_FINAL.mp4`);

  if (!fs.existsSync(scriptPath)) {
    console.error(`❌ Script not found: ${scriptPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(videoPath) && !DRY_RUN) {
    console.error(`❌ Final video not found: ${videoPath}`);
    console.error(`   Run first: node automation/saas_autopilot_editor_agent.js --topic ${TOPIC_ID}`);
    process.exit(1);
  }

  const script = readJson(scriptPath);
  const metadata = {
    title: script.video.title,
    description: script.metadata.description_template,
    tags: script.metadata.tags
  };

  console.log(`\n📺 SaaS Autopilot Publisher Agent`);
  console.log(`   Topic: ${TOPIC_ID} — ${metadata.title}`);
  console.log(`   Video: ${videoPath}`);
  console.log(`   Publish: ${PUBLISH_AT || 'private (no schedule)'}`);
  if (DRY_RUN) {
    console.log(`   Mode: DRY RUN — no upload\n`);
    console.log('   Would upload with metadata:');
    console.log(JSON.stringify(metadata, null, 2));
    return;
  }

  runQaGate();
  assertPilotReleaseGate();

  // Gate check — require separate OAuth
  if (!fs.existsSync(SAAS_AUTOPILOT_SECRETS_FILE)) {
    console.error(`\n🔴 GATE BLOCKED: SaaS Autopilot OAuth not yet set up.`);
    console.error(`   Required file missing: automation/credentials/saas_autopilot_client_secrets.json`);
    console.error(`   Set up a separate YouTube Brand Account and OAuth credential before uploading.`);
    console.error(`   See docs/team_structure.md for setup steps.`);
    process.exit(1);
  }

  // Canonical slate check — don't upload if slot already occupied
  if (PUBLISH_AT && fs.existsSync(CANONICAL_SLATE_FILE)) {
    const slate = readJson(CANONICAL_SLATE_FILE);
    const saasAutopilotSlots = slate.saas_autopilot || [];
    const conflict = saasAutopilotSlots.find(e => e.canonical && new Date(e.slot).toISOString() === new Date(PUBLISH_AT).toISOString());
    if (conflict) {
      console.error(`\n🔴 CANONICAL SLATE BLOCKED: Slot ${PUBLISH_AT} already has canonical entry:`);
      console.error(`   YouTube ID: ${conflict.youtube_id} — "${conflict.title}"`);
      console.error(`   Update metadata/canonical_slate.json to supersede it first.`);
      process.exit(1);
    }
  }

  const oauth2Client = await getOAuthClient();
  const uploaded = await uploadVideo(oauth2Client, videoPath, metadata);

  console.log(`\n✅ Upload complete!`);
  console.log(`   YouTube ID: ${uploaded.id}`);
  console.log(`   Title: ${uploaded.snippet.title}`);

  // Update uploads_tracker.json
  const tracker = readJson(TRACKER_FILE, { uploaded_files: {} });
  const filename = path.basename(videoPath);
  const previousUpload = tracker.uploaded_files[filename] || null;
  const previousUploads = [];
  if (previousUpload) {
    if (Array.isArray(previousUpload.previous_uploads)) {
      previousUploads.push(...previousUpload.previous_uploads);
    }
    if (previousUpload.youtube_id && previousUpload.youtube_id !== uploaded.id) {
      previousUploads.push({
        youtube_id: previousUpload.youtube_id,
        uploaded_at: previousUpload.uploaded_at || null,
        publish_at: previousUpload.publish_at || null,
        title: previousUpload.title || metadata.title,
        status_note: previousUpload.status_note || null,
        superseded_at: new Date().toISOString(),
        superseded_reason: 'Corrected reupload after duration, visual, and demo-slide QA rebuild'
      });
    }
  }
  tracker.uploaded_files[filename] = {
    youtube_id: uploaded.id,
    uploaded_at: new Date().toISOString(),
    publish_at: PUBLISH_AT || null,
    title: metadata.title,
    canonical: true,
    channel: 'saas_autopilot',
    status_note: `CANONICAL. SaaS Autopilot channel. ${PUBLISH_AT ? `Scheduled for ${PUBLISH_AT}` : 'Private - corrected reupload, no schedule set.'}`,
    previous_uploads: previousUploads
  };

  const duplicateCleanup = await deleteSupersededUploads(oauth2Client, previousUploads, uploaded.id);
  tracker.uploaded_files[filename].duplicate_cleanup = {
    checked_at: duplicateCleanup.checked_at,
    passed: duplicateCleanup.passed,
    deleted_or_absent_ids: duplicateCleanup.results
      .filter(item => item.deleted || item.already_absent)
      .map(item => item.youtube_id),
    report_path: DUPLICATE_CLEANUP_REPORT_FILE
  };
  writeJson(TRACKER_FILE, tracker);

  // Update canonical_slate.json
  const slate = readJson(CANONICAL_SLATE_FILE, { saas_autopilot: [] });
  if (!slate.saas_autopilot) slate.saas_autopilot = [];
  slate.saas_autopilot.push({
    slot: PUBLISH_AT || null,
    video_id: TOPIC_ID,
    youtube_id: uploaded.id,
    title: metadata.title,
    format: 'saas_autopilot_v1',
    canonical: true,
    non_canonical_ids: previousUploads.map(item => item.youtube_id).filter(Boolean),
    duplicate_cleanup: tracker.uploaded_files[filename].duplicate_cleanup,
    note: `Uploaded ${new Date().toISOString().slice(0, 10)}`
  });
  writeJson(CANONICAL_SLATE_FILE, slate);

  console.log(`\n📋 Next steps:`);
  console.log(`   1. Add thumbnail: YouTube Studio → ${uploaded.id}`);
  console.log(`   2. Add to playlist: AI Automation Workflows`);
  console.log(`   3. Verify schedule in YouTube Studio`);
  if (PUBLISH_AT) {
    console.log(`   4. Cut Short within 48h of publish date`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
