'use strict';

const fs = require('fs');
const path = require('path');
const { youtube: createYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const SAINTS_ROOT = path.resolve(__dirname, '..');
const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const publicOnly = Boolean(args['public-only']);
const targetVideo = args.video ? String(args.video) : '';

const METADATA_DIR = path.join(SAINTS_ROOT, 'metadata');
const STATUS_FILE = path.join(METADATA_DIR, 'youtube_channel_status_saints.json');
const TRACKER_FILE = path.join(METADATA_DIR, 'uploads_tracker.json');
const REPORT_FILE = path.join(METADATA_DIR, 'thumbnail_replacement_report.json');
const THUMBNAILS_DIR = args.folder
  ? path.resolve(SAINTS_ROOT, String(args.folder))
  : path.join(SAINTS_ROOT, 'assets', 'Thumbnails');
const ASSETS_DIR = path.join(SAINTS_ROOT, 'assets');
const ROOT = path.resolve(SAINTS_ROOT, '..');
const SECRETS_FILE = path.join(ROOT, 'automation', 'credentials', 'client_secrets.json');
const TOKENS_FILE = path.join(SAINTS_ROOT, 'automation', 'credentials', 'saints_oauth_tokens.json');
const EXPECTED_CHANNEL_ID = process.env.SAINTS_YOUTUBE_CHANNEL_ID || 'UCdXKrXsLAL_EhU-lPHDg3bw';

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

function videoNumberFromFilename(filename) {
  const match = String(filename || '').match(/SAINTS_VIDEO_(\d+)/i);
  return match ? Number(match[1]) : null;
}

function getAuthorizedYoutubeClient() {
  if (!fs.existsSync(SECRETS_FILE)) throw new Error(`Missing Saints OAuth client secrets: ${SECRETS_FILE}`);
  if (!fs.existsSync(TOKENS_FILE)) throw new Error(`Missing Saints OAuth tokens: ${TOKENS_FILE}`);

  const secrets = readJson(SECRETS_FILE, {});
  const client = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(
    client.client_id,
    client.client_secret,
    client.redirect_uris?.[0] || 'http://localhost:3000'
  );
  oauth2Client.on('tokens', tokens => {
    const existing = readJson(TOKENS_FILE, {});
    writeJson(TOKENS_FILE, { ...existing, ...tokens });
  });
  oauth2Client.setCredentials(readJson(TOKENS_FILE, {}));
  return createYoutubeClient({ version: 'v3', auth: oauth2Client });
}

async function verifySaintsChannel(youtube) {
  const channel = await youtube.channels.list({ part: ['snippet'], mine: true });
  const channelId = channel.data.items?.[0]?.id || '';
  if (channelId !== EXPECTED_CHANNEL_ID) {
    throw new Error(`Authenticated channel mismatch. Expected ${EXPECTED_CHANNEL_ID}, got ${channelId || 'unknown'}.`);
  }
  return channelId;
}

function liveVideos() {
  const status = readJson(STATUS_FILE, { videos: [] });
  return (status.videos || []).filter(video => {
    if (targetVideo && video.youtube_id !== targetVideo) return false;
    if (publicOnly && video.privacy_status !== 'public') return false;
    return true;
  });
}

function saintsNumbersForVideo(video) {
  const tracker = readJson(TRACKER_FILE, { uploaded_files: {} });
  const numbers = Object.entries(tracker.uploaded_files || {})
    .filter(([, record]) => record.youtube_id === video.youtube_id)
    .map(([filename]) => videoNumberFromFilename(filename))
    .filter(Boolean);
  return [...new Set(numbers)];
}

function thumbnailCandidates(number) {
  return [
    path.join(THUMBNAILS_DIR, `saints_video_${number}_generated_cinematic.png`),
    path.join(THUMBNAILS_DIR, `saints_thumbnail_video_${number}.png`),
    path.join(ASSETS_DIR, `saints_thumbnail_video_${number}.png`)
  ];
}

function findThumbnail(video) {
  const numbers = saintsNumbersForVideo(video);
  for (const number of numbers) {
    const found = thumbnailCandidates(number).find(candidate => fs.existsSync(candidate));
    if (found) return { number, thumbnailPath: found };
  }
  return { number: numbers[0] || null, thumbnailPath: null };
}

function buildPlan() {
  return liveVideos().map(video => {
    const match = findThumbnail(video);
    return {
      youtube_id: video.youtube_id,
      title: video.title,
      privacy_status: video.privacy_status,
      saints_video_number: match.number,
      thumbnail_path: match.thumbnailPath,
      action: match.thumbnailPath ? (apply ? 'replace_thumbnail' : 'dry_run_replace_thumbnail') : 'skip_no_thumbnail_match'
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
  const report = {
    generated_at: new Date().toISOString(),
    channel: 'The Saints',
    mode: apply ? 'apply' : 'dry-run',
    scope: publicOnly ? 'public-only' : 'public-and-private',
    thumbnails_dir: THUMBNAILS_DIR,
    items: []
  };

  const youtube = apply ? getAuthorizedYoutubeClient() : null;
  if (apply) report.authenticated_channel_id = await verifySaintsChannel(youtube);
  for (const item of buildPlan()) {
    const result = { ...item, ok: false, status_code: null, error: '' };
    if (!item.thumbnail_path) {
      result.error = 'No matching Saints thumbnail file found.';
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

  writeJson(REPORT_FILE, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error.response?.data ? JSON.stringify(error.response.data, null, 2) : error.stack || error.message);
  process.exit(1);
});
