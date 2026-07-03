const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();
const { SAINTS_CREDENTIALS_DIR } = require('./channel_paths');

const channelArg = process.argv.find(arg => arg.startsWith('--channel='));
const filteredArgs = process.argv.slice(2).filter(arg => !arg.startsWith('--channel='));
const [command, videoId, value] = filteredArgs;
const CHANNEL_PROFILE = channelArg ? channelArg.split('=').slice(1).join('=').toLowerCase() : 'corporate';
if (!command || !videoId) {
  console.error('Usage: node automation/youtube_video_ops.js [--channel=saints] <schedule|unschedule|public|private|description|verify|delete> <video_id> [value]');
  process.exit(1);
}

const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'client_secrets.json');
const TOKENS_FILE = path.join(
  CHANNEL_PROFILE === 'saints' ? SAINTS_CREDENTIALS_DIR : CREDENTIALS_DIR,
  CHANNEL_PROFILE === 'saints' ? 'saints_oauth_tokens.json' : 'oauth_tokens.json'
);
function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
}

async function client() {
  const secretsData = readJsonFile(SECRETS_FILE);
  const webOrInstalled = secretsData.installed || secretsData.web;
  const { client_id, client_secret, redirect_uris } = webOrInstalled;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0] || 'http://localhost:3000');
  oauth2Client.on('tokens', (tokens) => {
    const existingTokens = fs.existsSync(TOKENS_FILE) ? readJsonFile(TOKENS_FILE) : {};
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({ ...existingTokens, ...tokens }, null, 2));
  });
  oauth2Client.setCredentials(readJsonFile(TOKENS_FILE));
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

async function getVideo(youtube, id) {
  const res = await youtube.videos.list({ part: ['snippet', 'status'], id: [id] });
  const item = res.data.items && res.data.items[0];
  if (!item) throw new Error(`Video ${id} not found`);
  return item;
}

async function main() {
  const youtube = await client();
  const item = await getVideo(youtube, videoId);

  if (command === 'schedule') {
    if (!value) throw new Error('schedule requires ISO publishAt value');
    await youtube.videos.update({
      part: ['status'],
      requestBody: {
        id: videoId,
        status: { privacyStatus: 'private', publishAt: value, selfDeclaredMadeForKids: false }
      }
    });
  } else if (command === 'unschedule' || command === 'private') {
    await youtube.videos.update({ part: ['status'], requestBody: { id: videoId, status: { privacyStatus: 'private', selfDeclaredMadeForKids: false } } });
  } else if (command === 'public') {
    await youtube.videos.update({ part: ['status'], requestBody: { id: videoId, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } } });
  } else if (command === 'description') {
    if (!value || !fs.existsSync(value)) throw new Error('description requires a file path');
    const description = fs.readFileSync(value, 'utf-8').replace(/^\uFEFF/, '');
    await youtube.videos.update({
      part: ['snippet'],
      requestBody: {
        id: videoId,
        snippet: {
          title: item.snippet.title,
          description,
          tags: item.snippet.tags || [],
          categoryId: item.snippet.categoryId || '27',
          defaultLanguage: item.snippet.defaultLanguage || 'en'
        }
      }
    });
  } else if (command === 'delete') {
    await youtube.videos.delete({ id: videoId });
    console.log(JSON.stringify({
      id: videoId,
      title: item.snippet.title,
      privacyStatus: item.status.privacyStatus,
      publishAt: item.status.publishAt || null,
      deleted: true
    }, null, 2));
    return;
  } else if (command !== 'verify') {
    throw new Error(`Unknown command: ${command}`);
  }

  const updated = await getVideo(youtube, videoId);
  let captions = [];
  try {
    const captionRes = await youtube.captions.list({ part: ['snippet'], videoId });
    captions = (captionRes.data.items || []).map(c => ({ id: c.id, language: c.snippet.language, name: c.snippet.name, isDraft: c.snippet.isDraft }));
  } catch (err) {
    captions = [{ error: err.message }];
  }

  console.log(JSON.stringify({
    id: updated.id,
    title: updated.snippet.title,
    description_start: (updated.snippet.description || '').split(/\r?\n/).slice(0, 3).join('\n'),
    privacyStatus: updated.status.privacyStatus,
    publishAt: updated.status.publishAt || null,
    captions
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

