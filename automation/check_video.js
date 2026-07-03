const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const SAAS_AUTOMATION_CREDENTIALS_DIR = path.join(__dirname, '..', 'SaaS Autopilot', 'automation', 'credentials');

async function run() {
  const secretsFile = path.join(SAAS_AUTOMATION_CREDENTIALS_DIR, 'saas_autopilot_client_secrets.json');
  const tokensFile = path.join(SAAS_AUTOMATION_CREDENTIALS_DIR, 'saas_autopilot_oauth_token.json');

  if (!fs.existsSync(secretsFile) || !fs.existsSync(tokensFile)) {
    console.error('Missing credentials files.');
    return;
  }

  const secrets = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
  const tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
  const cfg = secrets.installed || secrets.web;
  
  const oauth2Client = new OAuth2Client(
    cfg.client_id,
    cfg.client_secret,
    (cfg.redirect_uris || ['http://localhost'])[0]
  );
  oauth2Client.setCredentials(tokens);

  const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });

  console.log('Querying video details for 69v0T0JAAUg...');
  const res = await youtube.videos.list({
    part: ['snippet', 'status', 'contentDetails'],
    id: ['69v0T0JAAUg']
  });

  console.log('Response items length:', res.data.items ? res.data.items.length : 0);
  if (res.data.items && res.data.items.length > 0) {
    console.log('Video details:', JSON.stringify(res.data.items[0], null, 2));
  } else {
    console.log('Video not found.');
  }

  console.log('\nQuerying channel list mine=true...');
  const channelRes = await youtube.channels.list({
    part: ['snippet', 'contentDetails'],
    mine: true
  });
  console.log('Channel details:', JSON.stringify(channelRes.data.items, null, 2));
}

run().catch(err => console.error(err));
