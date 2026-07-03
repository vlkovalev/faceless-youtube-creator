/**
 * SaaS Autopilot Drive Per-Video PDF Folders Agent
 * =================================================
 * Uploads per-video PDF materials into Google Drive:
 *
 * Parent:
 *   SaaS Autopilot - Downloadable Materials
 *
 * Children:
 *   SAAS-001 - <title>/
 *     SAAS-001_blueprint.pdf
 *     SAAS-001_templates.pdf
 *     SAAS-001_setup_checklist.pdf
 *
 * Then writes each folder URL to local metadata and can trash duplicate parent
 * folders with the same name.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { OAuth2Client } = require('google-auth-library');
const { openUrlHidden } = require('./open_url_hidden');

const WORKSPACE_DIR = path.join(__dirname, '..');
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const MATERIALS_ROOT = path.join(WORKSPACE_DIR, 'downloadable_materials', 'video_folders');
const SCRIPTS_DIR = path.join(WORKSPACE_DIR, 'scripts', 'saas_autopilot');
const METADATA_DIR = path.join(WORKSPACE_DIR, 'metadata');

const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_client_secrets.json');
const DRIVE_TOKENS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_google_drive_full_oauth_token.json');
const INDEX_FILE = path.join(METADATA_DIR, 'drive_video_materials_index.json');

const PARENT_FOLDER_NAME = 'SaaS Autopilot - Downloadable Materials';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DUPLICATE_TO_TRASH = '1qQPY836PBZmGxIH3cN_WbowJjveCwtqj';
const PREFERRED_PARENT_ID = '1VyPdFS2YEy7nT48-crmrOizs3dX_ObtX';

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true';
const TRASH_DUPLICATES = args['trash-duplicates'] !== 'false';

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getOAuthConfig() {
  const secrets = readJson(SECRETS_FILE);
  if (!secrets) throw new Error(`Missing OAuth client secrets: ${SECRETS_FILE}`);
  const cfg = secrets.installed || secrets.web;
  const redirectUri = (cfg.redirect_uris || ['http://localhost:3000/oauth2callback'])[0];
  return { cfg, redirectUri };
}

async function waitForOAuthCode(authUrl, redirectUri) {
  const parsedRedirect = new URL(redirectUri);
  const port = Number(parsedRedirect.port || 80);
  const callbackPath = parsedRedirect.pathname || '/oauth2callback';

  console.log('\nFull Google Drive OAuth required for folder cleanup and uploads.');
  console.log('Opening browser. If it does not open, paste this URL into your browser:\n');
  console.log(authUrl + '\n');
  openUrlHidden(authUrl);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = new URL(req.url, redirectUri);
      if (parsed.pathname !== callbackPath) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const code = parsed.searchParams.get('code');
      const error = parsed.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>Google Drive authorization complete.</h1><p>You can close this tab and return to Codex.</p></body></html>');
      server.close();
      if (error) reject(new Error(`OAuth error: ${error}`));
      else if (!code) reject(new Error('OAuth callback did not include a code.'));
      else resolve(code);
    });
    server.on('error', reject);
    server.listen(port, () => console.log(`Waiting for OAuth callback on ${redirectUri}`));
  });
}

async function getOAuthClient() {
  const { cfg, redirectUri } = getOAuthConfig();
  const oauth2Client = new OAuth2Client(cfg.client_id, cfg.client_secret, redirectUri);
  const existingTokens = readJson(DRIVE_TOKENS_FILE);

  if (existingTokens && String(existingTokens.scope || '').includes(DRIVE_SCOPE)) {
    oauth2Client.setCredentials(existingTokens);
    const refreshed = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(refreshed.credentials);
    writeJson(DRIVE_TOKENS_FILE, refreshed.credentials);
    return oauth2Client;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    scope: [DRIVE_SCOPE]
  });
  const code = await waitForOAuthCode(authUrl, redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  writeJson(DRIVE_TOKENS_FILE, tokens);
  return oauth2Client;
}

async function accessToken(auth) {
  const token = await auth.getAccessToken();
  const value = typeof token === 'string' ? token : token && token.token;
  if (!value) throw new Error('Failed to get Google access token.');
  return value;
}

async function driveRequest(auth, method, apiPath, { query = {}, headers = {}, body = null } = {}) {
  const token = await accessToken(auth);
  const url = new URL(apiPath.startsWith('http') ? apiPath : `https://www.googleapis.com${apiPath}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  return new Promise((resolve, reject) => {
    const req = https.request({
      method,
      protocol: url.protocol,
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      headers: { Authorization: `Bearer ${token}`, ...headers }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const isJson = String(res.headers['content-type'] || '').includes('application/json');
        const payload = isJson && text ? JSON.parse(text) : text;
        if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300) resolve(payload);
        else reject(new Error(`Drive API ${method} ${url.pathname} failed HTTP ${res.statusCode}: ${text}`));
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function escapeDriveQueryText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function listParentFolders(auth) {
  const q = [
    `name = '${escapeDriveQueryText(PARENT_FOLDER_NAME)}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    'trashed = false'
  ].join(' and ');
  const res = await driveRequest(auth, 'GET', '/drive/v3/files', {
    query: {
      q,
      fields: 'files(id,name,createdTime,modifiedTime,webViewLink)',
      pageSize: '50'
    }
  });
  return res.files || [];
}

async function createFolder(auth, name, parentId) {
  return driveRequest(auth, 'POST', '/drive/v3/files', {
    query: { fields: 'id,name,webViewLink' },
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined
    })
  });
}

async function chooseParentFolder(auth) {
  const folders = await listParentFolders(auth);
  const preferred = folders.find(folder => folder.id === PREFERRED_PARENT_ID);
  if (preferred) return preferred;
  if (folders.length) return folders.sort((a, b) => String(a.createdTime).localeCompare(String(b.createdTime)))[0];
  if (DRY_RUN) return { id: 'dry-run-parent', name: PARENT_FOLDER_NAME, webViewLink: null };
  return createFolder(auth, PARENT_FOLDER_NAME, null);
}

async function trashDuplicateParents(auth, keepId) {
  if (!TRASH_DUPLICATES) return [];
  const folders = await listParentFolders(auth);
  const trashed = [];
  for (const folder of folders) {
    if (folder.id === keepId) continue;
    if (folder.id !== DUPLICATE_TO_TRASH) continue;
    if (DRY_RUN) {
      console.log(`DRY RUN: would trash duplicate parent folder ${folder.id}`);
    } else {
      await driveRequest(auth, 'PATCH', `/drive/v3/files/${encodeURIComponent(folder.id)}`, {
        query: { fields: 'id,name,trashed' },
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true })
      });
      console.log(`Trashed duplicate parent folder: ${folder.id}`);
    }
    trashed.push(folder);
  }
  return trashed;
}

async function shareFolder(auth, folderId) {
  if (DRY_RUN) return;
  try {
    await driveRequest(auth, 'POST', `/drive/v3/files/${encodeURIComponent(folderId)}/permissions`, {
      query: { fields: 'id' },
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false })
    });
  } catch (err) {
    if (!String(err.message).includes('already exists')) throw err;
  }
}

async function findChildFolder(auth, parentId, name) {
  const q = [
    `name = '${escapeDriveQueryText(name)}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `'${parentId}' in parents`,
    'trashed = false'
  ].join(' and ');
  const res = await driveRequest(auth, 'GET', '/drive/v3/files', {
    query: { q, fields: 'files(id,name,webViewLink)', pageSize: '10' }
  });
  return res.files && res.files[0];
}

async function findOrCreateChildFolder(auth, parentId, name) {
  const existing = await findChildFolder(auth, parentId, name);
  if (existing) return existing;
  if (DRY_RUN) return { id: `dry-run-${name}`, name, webViewLink: null };
  return createFolder(auth, name, parentId);
}

async function findFile(auth, parentId, name) {
  const q = [
    `name = '${escapeDriveQueryText(name)}'`,
    `'${parentId}' in parents`,
    'trashed = false'
  ].join(' and ');
  const res = await driveRequest(auth, 'GET', '/drive/v3/files', {
    query: { q, fields: 'files(id,name,webViewLink)', pageSize: '10' }
  });
  return res.files && res.files[0];
}

async function uploadPdf(auth, folderId, filePath) {
  const name = path.basename(filePath);
  const existing = await findFile(auth, folderId, name);
  if (DRY_RUN) {
    console.log(`DRY RUN: would ${existing ? 'replace' : 'upload'} ${name}`);
    return existing || { id: `dry-run-${name}`, name, webViewLink: null };
  }

  const boundary = `saas_pdf_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const metadata = existing
    ? { name, mimeType: 'application/pdf' }
    : { name, parents: [folderId], mimeType: 'application/pdf' };
  const fileBytes = fs.readFileSync(filePath);
  const start = Buffer.from(
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/pdf\r\n\r\n',
    'utf8'
  );
  const end = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([start, fileBytes, end]);

  const method = existing ? 'PATCH' : 'POST';
  const uploadPath = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}`
    : 'https://www.googleapis.com/upload/drive/v3/files';
  const uploaded = await driveRequest(auth, method, uploadPath, {
    query: { uploadType: 'multipart', fields: 'id,name,webViewLink' },
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length)
    },
    body
  });
  console.log(`${existing ? 'Replaced' : 'Uploaded'} PDF: ${name}`);
  return uploaded;
}

function safeFolderName(title) {
  return String(title || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 140);
}

function updateScriptDescription(scriptPath, folderUrl) {
  const data = readJson(scriptPath);
  const current = String(data.metadata && data.metadata.description_template || '');
  const intro = current.split(/\n\n(?:📥|ðŸ“¥|\uD83D\uDCE5|\uD83D\uDD17|🔗|\uD83D\uDCCE|📌|ðŸ“Œ)/)[0].trim();
  const hashtagsMatch = current.match(/(?:\n\n)?(#AIAutomation[\s\S]*)$/);
  const hashtags = hashtagsMatch ? hashtagsMatch[1].trim() : '#AIAutomation #B2B #ClaudeAI #SaaS #Productivity';
  data.metadata.description_template = `${intro}\n\n📥 **Download this video's PDF materials:**\n${folderUrl}\n\nIncludes the blueprint PDF, templates PDF, and setup checklist PDF for this specific video.\n\n📌 **Key Timestamps:**\n0:00 — Hook\n0:30 — The Problem\n1:30 — The Stack\n2:30 — The Build\n6:00 — Results\n7:00 — Get the Code\n\n${hashtags}`;
  writeJson(scriptPath, data);
}

async function main() {
  const auth = await getOAuthClient();
  const parent = await chooseParentFolder(auth);
  console.log(`Using parent folder: ${parent.name} (${parent.id})`);
  await shareFolder(auth, parent.id);
  const trashed = await trashDuplicateParents(auth, parent.id);

  const items = [];
  const videoDirs = fs.readdirSync(MATERIALS_ROOT)
    .filter(name => fs.statSync(path.join(MATERIALS_ROOT, name)).isDirectory())
    .sort();

  for (const videoId of videoDirs) {
    const scriptPath = path.join(SCRIPTS_DIR, `${videoId.toLowerCase().replace(/-/g, '_')}_data.json`);
    const script = readJson(scriptPath);
    const title = script.video && script.video.title;
    const folderName = safeFolderName(`${videoId} - ${title}`);
    const child = await findOrCreateChildFolder(auth, parent.id, folderName);
    await shareFolder(auth, child.id);

    const localDir = path.join(MATERIALS_ROOT, videoId);
    const pdfs = fs.readdirSync(localDir).filter(name => name.toLowerCase().endsWith('.pdf')).sort();
    const uploaded = [];
    for (const pdf of pdfs) {
      const file = await uploadPdf(auth, child.id, path.join(localDir, pdf));
      uploaded.push(file);
    }
    const folderUrl = child.webViewLink || `https://drive.google.com/drive/folders/${child.id}`;
    updateScriptDescription(scriptPath, folderUrl);
    writeJson(path.join(localDir, 'resource_manifest.json'), {
      ...readJson(path.join(localDir, 'resource_manifest.json'), {}),
      public_drive_folder_url: folderUrl,
      qa_status: 'uploaded_to_google_drive',
      uploaded_files: uploaded.map(file => ({ id: file.id, name: file.name, url: file.webViewLink || null }))
    });
    items.push({ video_id: videoId, title, folder_id: child.id, folder_url: folderUrl, files: uploaded });
    console.log(`Uploaded folder for ${videoId}: ${folderUrl}`);
  }

  writeJson(INDEX_FILE, {
    checked_at: new Date().toISOString(),
    parent_folder_id: parent.id,
    parent_folder_url: parent.webViewLink || `https://drive.google.com/drive/folders/${parent.id}`,
    trashed_duplicate_folder_ids: trashed.map(folder => folder.id),
    videos: items
  });
  console.log(`Index written: ${INDEX_FILE}`);
}

main().catch(err => {
  console.error(`Fatal per-video Drive materials error: ${err.message}`);
  process.exit(1);
});
