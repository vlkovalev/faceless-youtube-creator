'use strict';

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CORPORATE_SHADOWS_ROOT = path.join(REPO_ROOT, 'Corporate Shadows');
const SAINTS_ROOT = path.join(REPO_ROOT, 'The Saints');
const SAAS_AUTOMATION_ROOT = path.join(REPO_ROOT, 'SaaS Autopilot');
const CORPORATE_SHADOWS_AUTOMATION_DIR = path.join(CORPORATE_SHADOWS_ROOT, 'automation');
const SAINTS_AUTOMATION_DIR = path.join(SAINTS_ROOT, 'automation');
const SAAS_AUTOMATION_DIR = path.join(SAAS_AUTOMATION_ROOT, 'automation');
const CORPORATE_SHADOWS_CREDENTIALS_DIR = path.join(CORPORATE_SHADOWS_AUTOMATION_DIR, 'credentials');
const SAINTS_CREDENTIALS_DIR = path.join(SAINTS_AUTOMATION_DIR, 'credentials');
const SAAS_AUTOMATION_CREDENTIALS_DIR = path.join(SAAS_AUTOMATION_DIR, 'credentials');
const CORPORATE_SHADOWS_METADATA_DIR = path.join(CORPORATE_SHADOWS_ROOT, 'metadata');
const SAINTS_METADATA_DIR = path.join(SAINTS_ROOT, 'metadata');
const SAAS_AUTOMATION_METADATA_DIR = path.join(SAAS_AUTOMATION_ROOT, 'metadata');
const CORPORATE_SHADOWS_SCRIPTS_DIR = path.join(CORPORATE_SHADOWS_ROOT, 'scripts');
const SAINTS_SCRIPTS_DIR = path.join(SAINTS_ROOT, 'scripts');
const SAAS_AUTOMATION_SCRIPTS_DIR = path.join(SAAS_AUTOMATION_ROOT, 'scripts');
const CORPORATE_SHADOWS_ASSETS_DIR = path.join(CORPORATE_SHADOWS_ROOT, 'assets');
const SAINTS_ASSETS_DIR = path.join(SAINTS_ROOT, 'assets');
const SAAS_AUTOMATION_ASSETS_DIR = path.join(SAAS_AUTOMATION_ROOT, 'assets');
const CORPORATE_SHADOWS_DOCS_DIR = path.join(CORPORATE_SHADOWS_ROOT, 'docs');
const SAINTS_DOCS_DIR = path.join(SAINTS_ROOT, 'docs');
const SAAS_AUTOMATION_DOCS_DIR = path.join(SAAS_AUTOMATION_ROOT, 'docs');
const CORPORATE_SHADOWS_VIDEOS_DIR = path.join(CORPORATE_SHADOWS_ROOT, 'videos');
const SAINTS_VIDEOS_DIR = path.join(SAINTS_ROOT, 'videos');
const SAAS_AUTOMATION_VIDEOS_DIR = path.join(SAAS_AUTOMATION_ROOT, 'videos');

function normalizeChannelProfile(profile) {
  const normalized = String(profile || '').toLowerCase().replace(/[-\s]+/g, '_');
  if (['saints', 'the_saints'].includes(normalized)) return 'saints';
  if (['saas_autopilot', 'saasautopilot', 'saas_automation', 'saasautomation', 'saas'].includes(normalized)) return 'saas_autopilot';
  if (['corporate', 'corporate_shadows', 'cs'].includes(normalized)) return 'corporate';
  return normalized || 'corporate';
}

function normalizeRel(relPath) {
  return String(relPath || '').replace(/\//g, path.sep).replace(/\\/g, path.sep);
}

function resolveCorporateShadowsRelative(relPath) {
  const rel = normalizeRel(relPath);
  if (!rel) return null;

  if (rel === 'channel_config.json') return path.join(CORPORATE_SHADOWS_ROOT, 'channel_config.json');
  if (
    rel.startsWith(`scripts${path.sep}`) ||
    rel.startsWith(`assets${path.sep}`) ||
    rel.startsWith(`docs${path.sep}`) ||
    rel.startsWith(`metadata${path.sep}`) ||
    rel.startsWith(`videos${path.sep}`) ||
    rel.startsWith(`automation${path.sep}`)
  ) {
    return path.join(CORPORATE_SHADOWS_ROOT, rel);
  }

  return null;
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

function resolveSaasAutomationRelative(relPath) {
  const rel = normalizeRel(relPath);
  if (!rel) return null;

  if (rel === 'saas_automation_channel_config.json' || rel === 'saas_autopilot_channel_config.json') {
    return path.join(SAAS_AUTOMATION_ROOT, 'saas_autopilot_channel_config.json');
  }
  if (
    rel.startsWith(`scripts${path.sep}saas_`) ||
    rel.startsWith(`scripts${path.sep}saas_autopilot`) ||
    rel.startsWith(`assets${path.sep}saas_`) ||
    rel.startsWith(`assets${path.sep}saas_autopilot`) ||
    rel.startsWith(`docs${path.sep}saas_`) ||
    rel.startsWith(`metadata${path.sep}youtube_channel_status_saas`) ||
    rel.startsWith(`metadata${path.sep}publish_delay_report`) ||
    rel.startsWith(`metadata${path.sep}uploads_tracker`) ||
    rel.startsWith(`metadata${path.sep}canonical_slate`) ||
    rel.startsWith(`automation${path.sep}saas_`)
  ) {
    return path.join(SAAS_AUTOMATION_ROOT, rel);
  }

  return null;
}

module.exports = {
  REPO_ROOT,
  CORPORATE_SHADOWS_ROOT,
  SAINTS_ROOT,
  SAAS_AUTOMATION_ROOT,
  CORPORATE_SHADOWS_AUTOMATION_DIR,
  SAINTS_AUTOMATION_DIR,
  SAAS_AUTOMATION_DIR,
  CORPORATE_SHADOWS_CREDENTIALS_DIR,
  SAINTS_CREDENTIALS_DIR,
  SAAS_AUTOMATION_CREDENTIALS_DIR,
  CORPORATE_SHADOWS_METADATA_DIR,
  SAINTS_METADATA_DIR,
  SAAS_AUTOMATION_METADATA_DIR,
  CORPORATE_SHADOWS_SCRIPTS_DIR,
  SAINTS_SCRIPTS_DIR,
  SAAS_AUTOMATION_SCRIPTS_DIR,
  CORPORATE_SHADOWS_ASSETS_DIR,
  SAINTS_ASSETS_DIR,
  SAAS_AUTOMATION_ASSETS_DIR,
  CORPORATE_SHADOWS_DOCS_DIR,
  SAINTS_DOCS_DIR,
  SAAS_AUTOMATION_DOCS_DIR,
  CORPORATE_SHADOWS_VIDEOS_DIR,
  SAINTS_VIDEOS_DIR,
  SAAS_AUTOMATION_VIDEOS_DIR,
  normalizeChannelProfile,
  resolveCorporateShadowsRelative,
  resolveSaintsRelative,
  resolveSaasAutomationRelative
};
