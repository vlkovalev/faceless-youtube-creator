const fs = require('fs');
const path = require('path');
const { youtube } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const SECRETS_FILE = 'c:/Users/heliu/Desktop/WebSItes/faceless-youtube-creator-clean/SaaS Autopilot/automation/credentials/saas_autopilot_client_secrets.json';
const TOKENS_FILE = 'c:/Users/heliu/Desktop/WebSItes/faceless-youtube-creator-clean/SaaS Autopilot/automation/credentials/saas_autopilot_oauth_token.json';

async function main() {
  if (!fs.existsSync(SECRETS_FILE) || !fs.existsSync(TOKENS_FILE)) {
    console.error('Missing secrets or tokens file.');
    return;
  }
  const secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  const cfg = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(
    cfg.client_id,
    cfg.client_secret,
    (cfg.redirect_uris || ['http://localhost'])[0]
  );
  oauth2Client.setCredentials(tokens);

  const client = youtube({ version: 'v3', auth: oauth2Client });
  const channelRes = await client.channels.list({
    part: ['snippet', 'contentDetails', 'statistics'],
    mine: true
  });

  const channel = channelRes.data.items && channelRes.data.items[0];
  if (!channel) {
    console.error('No channel returned.');
    return;
  }
  console.log('Channel ID:', channel.id);
  console.log('Channel Title:', channel.snippet.title);
  console.log('Channel CustomUrl:', channel.snippet.customUrl);
}

main().catch(console.error);
