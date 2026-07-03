const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
const { REPO_ROOT, SAINTS_CREDENTIALS_DIR, SAINTS_METADATA_DIR } = require('./channel_paths');

const WORKSPACE_DIR = REPO_ROOT;
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const channelArg = (process.argv.find(arg => arg.startsWith('--channel=')) || '').split('=')[1] || '';
const CHANNEL_PROFILE = channelArg.toLowerCase();
const TOKENS_FILE = path.join(
  CHANNEL_PROFILE === 'saints' ? SAINTS_CREDENTIALS_DIR : CREDENTIALS_DIR,
  CHANNEL_PROFILE === 'saints' ? 'saints_oauth_tokens.json' : 'oauth_tokens.json'
);
const STATUS_FILE = path.join(
  CHANNEL_PROFILE === 'saints' ? SAINTS_METADATA_DIR : path.join(WORKSPACE_DIR, 'metadata'),
  CHANNEL_PROFILE === 'saints' ? 'youtube_channel_status_saints.json' : 'youtube_channel_status.json'
);

async function getClient() {
  if (!fs.existsSync(SECRETS_FILE) || !fs.existsSync(TOKENS_FILE)) {
    throw new Error('Missing YouTube OAuth credentials.');
  }

  const secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  const cfg = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(
    cfg.client_id,
    cfg.client_secret,
    (cfg.redirect_uris || ['http://localhost'])[0]
  );

  oauth2Client.on('tokens', newTokens => {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({ ...tokens, ...newTokens }, null, 2));
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
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));

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
