'use strict';

const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');

const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_client_secrets.json');
const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_oauth_token.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function extractCode(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('http')) return decodeURIComponent(raw);
  const parsed = new URL(raw);
  return parsed.searchParams.get('code') || '';
}

async function main() {
  const callbackOrCode = process.argv.slice(2).join(' ');
  const code = extractCode(callbackOrCode);
  if (!code) {
    throw new Error('Missing OAuth callback URL or code argument.');
  }
  if (!fs.existsSync(SECRETS_FILE)) {
    throw new Error(`Missing SaaS Autopilot OAuth secrets: ${SECRETS_FILE}`);
  }

  const secrets = readJson(SECRETS_FILE);
  const cfg = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(
    cfg.client_id,
    cfg.client_secret,
    (cfg.redirect_uris || ['http://localhost:3000/oauth2callback'])[0]
  );

  const { tokens } = await oauth2Client.getToken(code);
  fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  console.log(`Saved SaaS Autopilot OAuth token: ${TOKENS_FILE}`);
}

main().catch(err => {
  console.error(`SaaS Autopilot OAuth exchange failed: ${err.message}`);
  process.exit(1);
});
