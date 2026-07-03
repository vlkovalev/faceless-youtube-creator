const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
const {
  REPO_ROOT,
  CORPORATE_SHADOWS_CREDENTIALS_DIR,
  SAINTS_CREDENTIALS_DIR,
  SAAS_AUTOMATION_CREDENTIALS_DIR,
  normalizeChannelProfile
} = require('./channel_paths');

const ROOT = REPO_ROOT;
const SHARED_CREDENTIALS_DIR = path.join(__dirname, 'credentials');

function argValue(name) {
  const arg = process.argv.find(a => a.startsWith(`${name}=`));
  return arg ? arg.split('=').slice(1).join('=') : '';
}

function profileConfig(profileInput) {
  const profile = normalizeChannelProfile(profileInput);

  if (profile === 'saints') {
    return {
      profile,
      expectedTitle: 'The Saints',
      expectedId: process.env.SAINTS_YOUTUBE_CHANNEL_ID || 'UCdXKrXsLAL_EhU-lPHDg3bw',
      secretsFile: fs.existsSync(path.join(SAINTS_CREDENTIALS_DIR, 'client_secrets.json'))
        ? path.join(SAINTS_CREDENTIALS_DIR, 'client_secrets.json')
        : path.join(SHARED_CREDENTIALS_DIR, 'client_secrets.json'),
      tokensFile: path.join(SAINTS_CREDENTIALS_DIR, 'saints_oauth_tokens.json')
    };
  }

  if (profile === 'saas_autopilot') {
    return {
      profile,
      expectedTitle: process.env.SAAS_AUTOPILOT_YOUTUBE_CHANNEL_TITLE || process.env.SAAS_AUTOMATION_YOUTUBE_CHANNEL_TITLE || 'SaaS Autopilot',
      expectedId: process.env.SAAS_AUTOPILOT_YOUTUBE_CHANNEL_ID || process.env.SAAS_AUTOMATION_YOUTUBE_CHANNEL_ID || '',
      secretsFile: path.join(SAAS_AUTOMATION_CREDENTIALS_DIR, 'saas_autopilot_client_secrets.json'),
      tokensFile: path.join(SAAS_AUTOMATION_CREDENTIALS_DIR, 'saas_autopilot_oauth_token.json')
    };
  }

  return {
    profile: 'corporate',
    expectedTitle: process.env.CORPORATE_YOUTUBE_CHANNEL_TITLE || 'Corporate Shadows',
    expectedId: process.env.CORPORATE_YOUTUBE_CHANNEL_ID || 'UCLoMxa-9cfCOP_5fPkL0lPg',
    secretsFile: fs.existsSync(path.join(CORPORATE_SHADOWS_CREDENTIALS_DIR, 'client_secrets.json'))
      ? path.join(CORPORATE_SHADOWS_CREDENTIALS_DIR, 'client_secrets.json')
      : path.join(SHARED_CREDENTIALS_DIR, 'client_secrets.json'),
    tokensFile: fs.existsSync(path.join(CORPORATE_SHADOWS_CREDENTIALS_DIR, 'oauth_tokens.json'))
      ? path.join(CORPORATE_SHADOWS_CREDENTIALS_DIR, 'oauth_tokens.json')
      : path.join(SHARED_CREDENTIALS_DIR, 'oauth_tokens.json')
  };
}

async function getYoutubeService(config) {
  if (!fs.existsSync(config.secretsFile) || !fs.existsSync(config.tokensFile)) {
    throw new Error(
      `Missing OAuth files for ${config.profile}. ` +
      `Secrets: ${config.secretsFile}; tokens: ${config.tokensFile}`
    );
  }

  const secretsData = JSON.parse(fs.readFileSync(config.secretsFile, 'utf-8').replace(/^\uFEFF/, ''));
  const tokenData = JSON.parse(fs.readFileSync(config.tokensFile, 'utf-8').replace(/^\uFEFF/, ''));
  const webOrInstalled = secretsData.installed || secretsData.web;
  const { client_id, client_secret, redirect_uris } = webOrInstalled;
  const oauth2Client = new OAuth2Client(client_id, client_secret, (redirect_uris || ['http://localhost'])[0]);
  oauth2Client.setCredentials(tokenData);
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

async function verifyChannel(youtube, config) {
  const res = await youtube.channels.list({ part: ['snippet'], mine: true });
  const channel = res.data.items && res.data.items[0];
  if (!channel) throw new Error('OAuth succeeded, but YouTube returned no channel.');

  const actualTitle = channel.snippet && channel.snippet.title;
  const idOk = config.expectedId ? channel.id === config.expectedId : true;
  const titleOk = config.expectedTitle ? String(actualTitle || '').toLowerCase() === config.expectedTitle.toLowerCase() : true;
  if (!idOk || !titleOk) {
    throw new Error(
      `Channel guard blocked duplicate cleaner for ${config.profile}. ` +
      `Expected ${config.expectedTitle || 'configured channel'}${config.expectedId ? ` (${config.expectedId})` : ''}, ` +
      `but token is for ${actualTitle} (${channel.id}).`
    );
  }
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[\(\[].*?[\)\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function cleanDuplicates(options = {}) {
  const config = profileConfig(options.channel || argValue('--channel') || 'corporate');
  const deleteDuplicates = Boolean(options.deleteDuplicates || process.argv.includes('--delete') || process.argv.includes('--auto-delete-old'));

  console.log(`Starting YouTube duplicate check for channel: ${config.profile}`);
  console.log(`Mode: ${deleteDuplicates ? 'delete duplicates' : 'report only'}`);

  const youtube = await getYoutubeService(config);
  await verifyChannel(youtube, config);

  const response = await youtube.search.list({
    part: 'id,snippet',
    forMine: true,
    type: 'video',
    maxResults: 50
  });

  const videoIds = (response.data.items || [])
    .map(item => item.id && item.id.videoId)
    .filter(Boolean);
  console.log(`[INFO] Found ${videoIds.length} videos on ${config.profile}.`);
  if (!videoIds.length) return { deletedCount: 0, duplicateGroups: 0 };

  const detailsRes = await youtube.videos.list({
    part: 'id,snippet,status',
    id: videoIds.join(',')
  });

  const groups = {};
  for (const video of detailsRes.data.items || []) {
    const key = normalizeTitle(video.snippet && video.snippet.title);
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(video);
  }

  let deletedCount = 0;
  let duplicateGroups = 0;
  for (const [titleKey, group] of Object.entries(groups)) {
    if (group.length <= 1) continue;
    duplicateGroups++;

    group.sort((a, b) => {
      const privateA = a.status.privacyStatus === 'private';
      const privateB = b.status.privacyStatus === 'private';
      if (privateA !== privateB) return privateA ? 1 : -1;
      return new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt);
    });

    const keepVideo = group[0];
    const toDelete = group.slice(1);
    console.log(`\n[DUPLICATE] ${titleKey}`);
    console.log(`  KEEP: ${keepVideo.snippet.title} (${keepVideo.id}, ${keepVideo.status.privacyStatus})`);

    for (const oldVideo of toDelete) {
      if (!deleteDuplicates) {
        console.log(`  REPORT ONLY: would delete ${oldVideo.snippet.title} (${oldVideo.id})`);
        continue;
      }
      await youtube.videos.delete({ id: oldVideo.id });
      console.log(`  DELETED: ${oldVideo.snippet.title} (${oldVideo.id})`);
      deletedCount++;
    }
  }

  console.log(`\nDuplicate check complete. Groups: ${duplicateGroups}. Deleted: ${deletedCount}.`);
  return { deletedCount, duplicateGroups };
}

if (require.main === module) {
  cleanDuplicates().catch(err => {
    console.error('Fatal duplicate cleaner error:', err.message);
    process.exit(1);
  });
}

module.exports = { cleanDuplicates };
