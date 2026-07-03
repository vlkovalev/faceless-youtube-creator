const fs = require('fs');
const path = require('path');
const { youtube } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const SECRETS_FILE = 'c:/Users/heliu/Desktop/WebSItes/faceless-youtube-creator-clean/SaaS Autopilot/automation/credentials/saas_autopilot_client_secrets.json';
const TOKENS_FILE = 'c:/Users/heliu/Desktop/WebSItes/faceless-youtube-creator-clean/SaaS Autopilot/automation/credentials/saas_autopilot_oauth_token.json';
const TRACKER_FILE = 'c:/Users/heliu/Desktop/WebSItes/faceless-youtube-creator-clean/SaaS Autopilot/metadata/uploads_tracker.json';

async function main() {
  if (!fs.existsSync(SECRETS_FILE) || !fs.existsSync(TOKENS_FILE) || !fs.existsSync(TRACKER_FILE)) {
    console.error('Required files missing.');
    return;
  }

  const tracker = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  const uploadedFiles = tracker.uploaded_files || {};
  const videoIds = Object.values(uploadedFiles)
    .map(f => f.youtube_id)
    .filter(Boolean);

  if (videoIds.length === 0) {
    console.log('No SaaS Autopilot videos found in tracker.');
    return;
  }

  console.log(`Found ${videoIds.length} SaaS Autopilot videos in uploads tracker. Connecting to YouTube...`);

  const secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  const cfg = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(
    cfg.client_id,
    cfg.client_secret,
    (cfg.redirect_uris || ['http://localhost'])[0]
  );
  oauth2Client.setCredentials(tokens);

  const client = youtube({ version: 'v3', auth: oauth2Client });

  // Let's verify the channel title first to be 100% sure we are modifying the right channel.
  const channelRes = await client.channels.list({ part: ['snippet'], mine: true });
  const channel = channelRes.data.items && channelRes.data.items[0];
  if (!channel) {
    console.error('Could not retrieve channel details.');
    return;
  }
  console.log(`Connected to channel: ${channel.snippet.title} (${channel.id})`);

  if (channel.snippet.title !== 'The Saints') {
    console.error('Safety check failed: The token is not connected to The Saints channel.');
    return;
  }

  console.log('\nStarting unscheduling of SaaS Autopilot videos from The Saints channel...\n');

  for (const videoId of videoIds) {
    try {
      const current = await client.videos.list({ part: ['snippet', 'status'], id: [videoId] });
      const item = current.data.items && current.data.items[0];
      if (!item) {
        console.log(`⚠️ Video ${videoId} not found on YouTube.`);
        continue;
      }

      console.log(`Processing: "${item.snippet.title}" (${videoId})`);
      console.log(`  Current Privacy: ${item.status.privacyStatus}`);
      console.log(`  Current PublishAt: ${item.status.publishAt || 'none'}`);

      if (item.status.privacyStatus === 'public') {
        console.log('  ⚠️ WARNING: Video is already public. Making it private.');
      }

      const status = {
        ...item.status,
        privacyStatus: 'private',
        selfDeclaredMadeForKids: false
      };
      delete status.publishAt;

      await client.videos.update({
        part: ['status'],
        requestBody: {
          id: videoId,
          status
        }
      });

      console.log(`  ✅ Successfully set to Private (unscheduled).`);
    } catch (e) {
      console.error(`  ❌ Error processing video ${videoId}:`, e.message);
    }
  }

  console.log('\nFinished unscheduling SaaS Autopilot videos.');
}

main().catch(console.error);
