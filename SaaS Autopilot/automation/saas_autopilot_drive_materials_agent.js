/**
 * SaaS Autopilot Google Drive Materials Agent
 * ===========================================
 * Creates/finds a Google Drive folder, uploads the downloadable blueprint ZIP,
 * sets it to "Anyone with the link: Viewer", and writes the public URL into
 * the local resource manifest.
 *
 * Usage:
 *   node automation/saas_autopilot_drive_materials_agent.js
 *   node automation/saas_autopilot_drive_materials_agent.js --dry-run
 *
 * First run opens a Google OAuth consent page for Drive permissions.
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
const MATERIALS_DIR = path.join(WORKSPACE_DIR, 'downloadable_materials');
const PACK_DIR = path.join(MATERIALS_DIR, 'saas_autopilot_blueprint_pack');
const ZIP_PATH = path.join(MATERIALS_DIR, 'saas_autopilot_blueprint_pack_v1.zip');
const MANIFEST_PATH = path.join(PACK_DIR, 'resource_manifest.json');

const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_client_secrets.json');
const DRIVE_TOKENS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_google_drive_oauth_token.json');

const FOLDER_NAME = 'SaaS Autopilot - Downloadable Materials';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true';

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

  console.log('\nGoogle Drive OAuth required.');
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
    server.listen(port, () => {
      console.log(`Waiting for OAuth callback on ${redirectUri}`);
    });
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
      headers: {
        Authorization: `Bearer ${token}`,
        ...headers
      }
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

async function findFolder(auth) {
  const q = [
    `name = '${escapeDriveQueryText(FOLDER_NAME)}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    'trashed = false'
  ].join(' and ');

  const res = await driveRequest(auth, 'GET', '/drive/v3/files', {
    query: {
      q,
      fields: 'files(id,name,webViewLink)',
      pageSize: '10'
    }
  });
  return res.files && res.files[0];
}

async function createFolder(auth) {
  return driveRequest(auth, 'POST', '/drive/v3/files', {
    query: { fields: 'id,name,webViewLink' },
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
}

async function findOrCreateFolder(auth) {
  const existing = await findFolder(auth);
  if (existing) {
    console.log(`Found Drive folder: ${existing.name} (${existing.id})`);
    return existing;
  }
  if (DRY_RUN) {
    console.log(`DRY RUN: would create Drive folder "${FOLDER_NAME}"`);
    return { id: 'dry-run-folder-id', name: FOLDER_NAME, webViewLink: null };
  }
  const folder = await createFolder(auth);
  console.log(`Created Drive folder: ${folder.name} (${folder.id})`);
  return folder;
}

async function findExistingZip(auth, folderId) {
  const q = [
    `name = '${escapeDriveQueryText(path.basename(ZIP_PATH))}'`,
    `'${folderId}' in parents`,
    'trashed = false'
  ].join(' and ');

  const res = await driveRequest(auth, 'GET', '/drive/v3/files', {
    query: {
      q,
      fields: 'files(id,name,webViewLink,webContentLink)',
      pageSize: '10'
    }
  });
  return res.files && res.files[0];
}

async function uploadZip(auth, folderId) {
  const existing = await findExistingZip(auth, folderId);
  if (existing) {
    console.log(`Found existing ZIP in Drive: ${existing.name} (${existing.id})`);
    return existing;
  }

  if (DRY_RUN) {
    console.log(`DRY RUN: would upload ${ZIP_PATH}`);
    return {
      id: 'dry-run-file-id',
      name: path.basename(ZIP_PATH),
      webViewLink: null,
      webContentLink: null
    };
  }

  const boundary = `saas_autopilot_${Date.now()}`;
  const metadata = {
    name: path.basename(ZIP_PATH),
    parents: [folderId],
    mimeType: 'application/zip'
  };
  const fileBytes = fs.readFileSync(ZIP_PATH);
  const start = Buffer.from(
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/zip\r\n\r\n',
    'utf8'
  );
  const end = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([start, fileBytes, end]);

  const uploaded = await driveRequest(auth, 'POST', 'https://www.googleapis.com/upload/drive/v3/files', {
    query: {
      uploadType: 'multipart',
      fields: 'id,name,webViewLink,webContentLink'
    },
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length)
    },
    body
  });
  console.log(`Uploaded ZIP: ${uploaded.name} (${uploaded.id})`);
  return uploaded;
}

async function shareFile(auth, fileId) {
  if (DRY_RUN) {
    console.log(`DRY RUN: would share file ${fileId} with anyone as reader`);
    return;
  }

  await driveRequest(auth, 'POST', `/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
    query: { fields: 'id' },
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'anyone',
      role: 'reader',
      allowFileDiscovery: false
    })
  });
  console.log('Shared ZIP: anyone with the link can view/download.');
}

async function refreshFileMetadata(auth, fileId) {
  return driveRequest(auth, 'GET', `/drive/v3/files/${encodeURIComponent(fileId)}`, {
    query: { fields: 'id,name,webViewLink,webContentLink' }
  });
}

function publicDownloadUrl(file) {
  return file.webContentLink || `https://drive.google.com/uc?export=download&id=${file.id}`;
}

function updateManifest(folder, file) {
  const manifest = readJson(MANIFEST_PATH, {});
  manifest.storage_url = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;
  manifest.public_download_url = publicDownloadUrl(file);
  manifest.landing_page_url = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
  manifest.permission_status = 'anyone_with_link_viewer';
  manifest.qa_status = 'uploaded_to_google_drive_pending_qaqc';
  manifest.last_checked_date = new Date().toISOString().slice(0, 10);
  writeJson(MANIFEST_PATH, manifest);
  return manifest;
}

async function main() {
  if (!fs.existsSync(ZIP_PATH)) throw new Error(`Missing ZIP file: ${ZIP_PATH}`);
  if (!fs.existsSync(MANIFEST_PATH)) throw new Error(`Missing resource manifest: ${MANIFEST_PATH}`);

  const auth = await getOAuthClient();
  const folder = await findOrCreateFolder(auth);
  const uploadedInitial = await uploadZip(auth, folder.id);
  await shareFile(auth, uploadedInitial.id);
  const uploaded = DRY_RUN ? uploadedInitial : await refreshFileMetadata(auth, uploadedInitial.id);
  const manifest = updateManifest(folder, uploaded);

  console.log('\nGoogle Drive materials setup complete.');
  console.log(`Folder: ${manifest.storage_url}`);
  console.log(`Download URL: ${manifest.public_download_url}`);
  console.log(`View URL: ${manifest.landing_page_url}`);
}

main().catch(err => {
  console.error(`Fatal Drive materials error: ${err.message}`);
  process.exit(1);
});
