'use strict';

const path = require('path');

const REPO_ROOT = path.basename(path.resolve(__dirname, '..')) === 'The Saints'
  ? path.resolve(__dirname, '..', '..')
  : path.resolve(__dirname, '..');
const SAINTS_ROOT = path.join(REPO_ROOT, 'The Saints');
const SAINTS_AUTOMATION_DIR = path.join(SAINTS_ROOT, 'automation');
const SAINTS_CREDENTIALS_DIR = path.join(SAINTS_AUTOMATION_DIR, 'credentials');
const SAINTS_METADATA_DIR = path.join(SAINTS_ROOT, 'metadata');
const SAINTS_SCRIPTS_DIR = path.join(SAINTS_ROOT, 'scripts');
const SAINTS_ASSETS_DIR = path.join(SAINTS_ROOT, 'assets');
const SAINTS_DOCS_DIR = path.join(SAINTS_ROOT, 'docs');
const SAINTS_VIDEOS_DIR = path.join(SAINTS_ROOT, 'videos');

function normalizeRel(relPath) {
  return String(relPath || '').replace(/\//g, path.sep).replace(/\\/g, path.sep);
}

function resolveSaintsRelative(relPath) {
  const rel = normalizeRel(relPath);
  if (!rel) return null;

  if (rel === 'saints_channel_config.json') return path.join(SAINTS_ROOT, 'saints_channel_config.json');
  if (rel === path.join('automation', 'credentials', 'saints_oauth_tokens.json')) {
    return path.join(SAINTS_CREDENTIALS_DIR, 'saints_oauth_tokens.json');
  }
  if (
    rel.startsWith(`scripts${path.sep}saints_`) ||
    rel.startsWith(`assets${path.sep}saints_`) ||
    rel.startsWith(`docs${path.sep}saints_`) ||
    rel.startsWith(`metadata${path.sep}saints_`) ||
    rel === path.join('metadata', 'youtube_channel_status_saints.json') ||
    rel.startsWith(`videos${path.sep}saints`) ||
    rel.startsWith(`videos${path.sep}saints_ready`) ||
    rel.startsWith(`automation${path.sep}saints_`)
  ) {
    return path.join(SAINTS_ROOT, rel);
  }

  return null;
}

module.exports = {
  REPO_ROOT,
  SAINTS_ROOT,
  SAINTS_AUTOMATION_DIR,
  SAINTS_CREDENTIALS_DIR,
  SAINTS_METADATA_DIR,
  SAINTS_SCRIPTS_DIR,
  SAINTS_ASSETS_DIR,
  SAINTS_DOCS_DIR,
  SAINTS_VIDEOS_DIR,
  resolveSaintsRelative
};
