'use strict';

const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const ROOT = path.resolve(__dirname, '..');
const args = parseArgs(process.argv.slice(2));
const channel = String(args.channel || 'corporate').toLowerCase();
const apply = Boolean(args.apply);
const includePrivate = Boolean(args['include-private']);
const targetVideo = args.video ? String(args.video) : '';

const CHANNELS = {
  corporate: {
    name: 'Corporate Shadows',
    root: path.join(ROOT, 'Corporate Shadows'),
    credentialsDir: path.join(ROOT, 'Corporate Shadows', 'automation', 'credentials'),
    statusFile: path.join(ROOT, 'Corporate Shadows', 'metadata', 'youtube_channel_status.json'),
    trackerFile: path.join(ROOT, 'Corporate Shadows', 'metadata', 'uploads_tracker.json'),
    calendarFile: path.join(ROOT, 'Corporate Shadows', 'metadata', 'content_calendar.json'),
    defaultThumbnailDir: path.join(ROOT, 'Corporate Shadows', 'assets'),
    reportFile: path.join(ROOT, 'Corporate Shadows', 'metadata', 'thumbnail_replacement_report.json')
  },
  saints: {
    name: 'The Saints',
    root: path.join(ROOT, 'The Saints'),
    credentialsDir: path.join(ROOT, 'The Saints', 'automation', 'credentials'),
    statusFile: path.join(ROOT, 'The Saints', 'metadata', 'youtube_channel_status_saints.json'),
    trackerFile: path.join(ROOT, 'The Saints', 'metadata', 'uploads_tracker.json'),
    queueFile: path.join(ROOT, 'The Saints', 'metadata', 'queue.json'),
    defaultThumbnailDir: path.join(ROOT, 'The Saints', 'assets', 'Thumbnails'),
    reportFile: path.join(ROOT, 'The Saints', 'metadata', 'thumbnail_replacement_report.json')
  }
};

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const body = arg.slice(2);
    const idx = body.indexOf('=');
    if (idx === -1) parsed[body] = true;
    else parsed[body.slice(0, idx)] = body.slice(idx + 1);
  }
  return parsed;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function getAuth(credentialsDir) {
  const channelSecretsFile = path.join(credentialsDir, 'client_secrets.json');
  const secretsFile = fs.existsSync(channelSecretsFile)
    ? channelSecretsFile
    : path.join(ROOT, 'automation', 'credentials', 'client_secrets.json');
  const tokensFile = channel === 'saints'
    ? path.join(credentialsDir, 'saints_oauth_tokens.json')
    : path.join(credentialsDir, 'oauth_tokens.json');
  if (!fs.existsSync(secretsFile)) throw new Error(`Missing OAuth client secrets: ${secretsFile}`);
  if (!fs.existsSync(tokensFile)) throw new Error(`Missing OAuth tokens: ${tokensFile}`);

  const secrets = readJson(secretsFile, {});
  const client = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(
    client.client_id,
    client.client_secret,
    client.redirect_uris?.[0] || 'http://localhost:3000'
  );
  oauth2Client.on('tokens', tokens => {
    const existing = readJson(tokensFile, {});
    writeJson(tokensFile, { ...existing, ...tokens });
  });
  oauth2Client.setCredentials(readJson(tokensFile, {}));
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

function videoNumberFromFilename(filename) {
  const match = String(filename || '').match(/(?:FINAL_VIDEO_|SAINTS_VIDEO_)(\d+)/i);
  return match ? Number(match[1]) : null;
}

function publicVideos(statusFile) {
  const status = readJson(statusFile, { videos: [] });
  return (status.videos || []).filter(video => {
    if (targetVideo && video.youtube_id !== targetVideo) return false;
    if (includePrivate) return true;
    return video.privacy_status === 'public';
  });
}

function findCorporateThumbnail(config, video) {
  const calendar = readJson(config.calendarFile, []);
  const row = calendar.find(item => item.youtube_video_id === video.youtube_id || item.title === video.title);
  if (!row) return null;
  const candidate = path.resolve(config.root, row.thumbnail_url || '');
  return fs.existsSync(candidate) ? candidate : null;
}

function saintsThumbnailCandidates(config, video) {
  const tracker = readJson(config.trackerFile, { uploaded_files: {} });
  const matches = Object.entries(tracker.uploaded_files || {})
    .filter(([, record]) => record.youtube_id === video.youtube_id)
    .map(([filename]) => videoNumberFromFilename(filename))
    .filter(Boolean);

  const uniqueNumbers = [...new Set(matches)];
  const dir = thumbnailDir(config);
  const candidates = [];
  for (const n of uniqueNumbers) {
    candidates.push(path.join(dir, `saints_video_${n}_generated_cinematic.png`));
    candidates.push(path.join(dir, `saints_thumbnail_video_${n}.png`));
    candidates.push(path.join(config.root, 'assets', `saints_thumbnail_video_${n}.png`));
  }
  return candidates;
}

function findSaintsThumbnail(config, video) {
  const candidates = saintsThumbnailCandidates(config, video);
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function thumbnailDir(config) {
  return args.folder ? path.resolve(ROOT, String(args.folder)) : config.defaultThumbnailDir;
}

function buildPlan(config) {
  const videos = publicVideos(config.statusFile);
  return videos.map(video => {
    const thumbnailPath = channel === 'saints'
      ? findSaintsThumbnail(config, video)
      : findCorporateThumbnail(config, video);
    return {
      youtube_id: video.youtube_id,
      title: video.title,
      privacy_status: video.privacy_status,
      thumbnail_path: thumbnailPath,
      action: thumbnailPath ? (apply ? 'replace' : 'dry_run_replace') : 'skip_no_thumbnail_match'
    };
  });
}

async function replaceThumbnail(youtube, item) {
  const response = await youtube.thumbnails.set({
    videoId: item.youtube_id,
    media: { body: fs.createReadStream(item.thumbnail_path) }
  });
  return response.status;
}

async function main() {
  const config = CHANNELS[channel];
  if (!config) throw new Error(`Unknown channel '${channel}'. Use --channel=corporate or --channel=saints.`);

  const plan = buildPlan(config);
  const report = {
    generated_at: new Date().toISOString(),
    channel: config.name,
    mode: apply ? 'apply' : 'dry-run',
    public_only: !includePrivate,
    thumbnail_dir: thumbnailDir(config),
    items: []
  };

  let youtube = null;
  if (apply) youtube = getAuth(config.credentialsDir);

  for (const item of plan) {
    const result = { ...item, ok: false, status_code: null, error: '' };
    if (!item.thumbnail_path) {
      result.error = 'No matching thumbnail found.';
      report.items.push(result);
      continue;
    }
    if (!apply) {
      result.ok = true;
      report.items.push(result);
      continue;
    }
    try {
      result.status_code = await replaceThumbnail(youtube, item);
      result.ok = result.status_code >= 200 && result.status_code < 300;
    } catch (error) {
      result.error = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    }
    report.items.push(result);
  }

  report.summary = {
    total: report.items.length,
    matched: report.items.filter(item => item.thumbnail_path).length,
    succeeded: report.items.filter(item => item.ok).length,
    skipped: report.items.filter(item => !item.thumbnail_path).length,
    failed: report.items.filter(item => item.thumbnail_path && !item.ok).length
  };

  writeJson(config.reportFile, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error.response?.data ? JSON.stringify(error.response.data, null, 2) : error.stack || error.message);
  process.exit(1);
});
