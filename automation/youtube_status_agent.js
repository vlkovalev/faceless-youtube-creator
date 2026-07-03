const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
const {
  REPO_ROOT,
  CORPORATE_SHADOWS_CREDENTIALS_DIR,
  CORPORATE_SHADOWS_METADATA_DIR,
  SAINTS_CREDENTIALS_DIR,
  SAINTS_METADATA_DIR,
  SAAS_AUTOMATION_CREDENTIALS_DIR,
  SAAS_AUTOMATION_METADATA_DIR,
  normalizeChannelProfile
} = require('./channel_paths');

const WORKSPACE_DIR = REPO_ROOT;
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const channelArg = (process.argv.find(arg => arg.startsWith('--channel=')) || '').split('=')[1] || '';
const CHANNEL_PROFILE = normalizeChannelProfile(channelArg || 'corporate');

function getProfileConfig(profile) {
  if (profile === 'saints') {
    return {
      expectedChannelTitle: 'The Saints',
      expectedChannelId: process.env.SAINTS_YOUTUBE_CHANNEL_ID || 'UCdXKrXsLAL_EhU-lPHDg3bw',
      secretsFile: fs.existsSync(path.join(SAINTS_CREDENTIALS_DIR, 'client_secrets.json'))
        ? path.join(SAINTS_CREDENTIALS_DIR, 'client_secrets.json')
        : path.join(CREDENTIALS_DIR, 'client_secrets.json'),
      tokensFile: path.join(SAINTS_CREDENTIALS_DIR, 'saints_oauth_tokens.json'),
      statusFile: path.join(SAINTS_METADATA_DIR, 'youtube_channel_status_saints.json')
    };
  }

  if (profile === 'saas_autopilot') {
    return {
      expectedChannelTitle: process.env.SAAS_AUTOPILOT_YOUTUBE_CHANNEL_TITLE || process.env.SAAS_AUTOMATION_YOUTUBE_CHANNEL_TITLE || 'SaaS Autopilot',
      expectedChannelId: process.env.SAAS_AUTOPILOT_YOUTUBE_CHANNEL_ID || process.env.SAAS_AUTOMATION_YOUTUBE_CHANNEL_ID || '',
      secretsFile: path.join(SAAS_AUTOMATION_CREDENTIALS_DIR, 'saas_autopilot_client_secrets.json'),
      tokensFile: path.join(SAAS_AUTOMATION_CREDENTIALS_DIR, 'saas_autopilot_oauth_token.json'),
      statusFile: path.join(SAAS_AUTOMATION_METADATA_DIR, 'youtube_channel_status_saas_autopilot.json')
    };
  }

  return {
    expectedChannelTitle: process.env.CORPORATE_YOUTUBE_CHANNEL_TITLE || 'Corporate Shadows',
    expectedChannelId: process.env.CORPORATE_YOUTUBE_CHANNEL_ID || 'UCLoMxa-9cfCOP_5fPkL0lPg',
    secretsFile: fs.existsSync(path.join(CORPORATE_SHADOWS_CREDENTIALS_DIR, 'client_secrets.json'))
      ? path.join(CORPORATE_SHADOWS_CREDENTIALS_DIR, 'client_secrets.json')
      : path.join(CREDENTIALS_DIR, 'client_secrets.json'),
    tokensFile: fs.existsSync(path.join(CORPORATE_SHADOWS_CREDENTIALS_DIR, 'oauth_tokens.json'))
      ? path.join(CORPORATE_SHADOWS_CREDENTIALS_DIR, 'oauth_tokens.json')
      : path.join(CREDENTIALS_DIR, 'oauth_tokens.json'),
    statusFile: path.join(CORPORATE_SHADOWS_METADATA_DIR, 'youtube_channel_status.json')
  };
}

const PROFILE = getProfileConfig(CHANNEL_PROFILE);

async function getClient() {
  if (!fs.existsSync(PROFILE.secretsFile) || !fs.existsSync(PROFILE.tokensFile)) {
    throw new Error('Missing YouTube OAuth credentials.');
  }

  const secrets = JSON.parse(fs.readFileSync(PROFILE.secretsFile, 'utf8'));
  const tokens = JSON.parse(fs.readFileSync(PROFILE.tokensFile, 'utf8'));
  const cfg = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(
    cfg.client_id,
    cfg.client_secret,
    (cfg.redirect_uris || ['http://localhost'])[0]
  );

  oauth2Client.on('tokens', newTokens => {
    fs.writeFileSync(PROFILE.tokensFile, JSON.stringify({ ...tokens, ...newTokens }, null, 2));
  });

  oauth2Client.setCredentials(tokens);
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

async function fetchChannelStatus() {
  const youtube = await getClient();
  const channelRes = await youtube.channels.list({
    part: ['snippet', 'contentDetails', 'statistics'],
    mine: true
  });

  const channel = channelRes.data.items && channelRes.data.items[0];
  if (!channel) throw new Error('OAuth succeeded, but no channel was returned.');

  const expectedId = PROFILE.expectedChannelId;
  const expectedTitle = PROFILE.expectedChannelTitle;
  const actualTitle = channel.snippet && channel.snippet.title;
  const idOk = expectedId ? channel.id === expectedId : true;
  const titleOk = expectedTitle ? String(actualTitle || '').toLowerCase() === expectedTitle.toLowerCase() : true;
  if (!idOk || !titleOk) {
    throw new Error(
      `Channel guard blocked status sync for '${CHANNEL_PROFILE || 'corporate'}'. ` +
      `Expected ${expectedTitle || 'configured channel'}${expectedId ? ` (${expectedId})` : ''}, ` +
      `but OAuth token is for '${actualTitle}' (${channel.id}).`
    );
  }

  const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
  const playlistRes = await youtube.playlistItems.list({
    part: ['snippet', 'contentDetails', 'status'],
    playlistId: uploadsPlaylistId,
    maxResults: 50
  });

  const ids = (playlistRes.data.items || [])
    .map(item => item.contentDetails.videoId)
    .filter(Boolean);

  let videos = [];
  if (ids.length) {
    const videoRes = await youtube.videos.list({
      part: ['snippet', 'status', 'contentDetails', 'statistics'],
      id: ids
    });

    videos = (videoRes.data.items || []).map(video => ({
      youtube_id: video.id,
      title: video.snippet.title,
      privacy_status: video.status.privacyStatus,
      publish_at: video.status.publishAt || '',
      published_at: video.snippet.publishedAt || '',
      duration: video.contentDetails.duration,
      view_count: Number(video.statistics.viewCount || 0),
      like_count: Number(video.statistics.likeCount || 0),
      comment_count: Number(video.statistics.commentCount || 0),
      made_for_kids: Boolean(video.status.madeForKids)
    }));
  }

  return {
    synced_at: new Date().toISOString(),
    channel: {
      id: channel.id,
      title: channel.snippet.title,
      uploads_playlist_id: uploadsPlaylistId,
      subscriber_count: Number(channel.statistics.subscriberCount || 0),
      video_count: Number(channel.statistics.videoCount || 0),
      view_count: Number(channel.statistics.viewCount || 0)
    },
    videos
  };
}

async function run() {
  const status = await fetchChannelStatus();
  fs.mkdirSync(path.dirname(PROFILE.statusFile), { recursive: true });
  fs.writeFileSync(PROFILE.statusFile, JSON.stringify(status, null, 2));

  console.log(`Synced YouTube channel: ${status.channel.title}`);
  console.log(`Channel ID: ${status.channel.id}`);
  console.log(`Videos found: ${status.videos.length}`);
  for (const video of status.videos) {
    const publish = video.publish_at ? ` publishAt=${video.publish_at}` : '';
    console.log(`- ${video.youtube_id} | ${video.privacy_status}${publish} | ${video.title}`);
  }
}

run().catch(error => {
  console.error(`YouTube status sync failed: ${error.message}`);
  process.exit(1);
});
