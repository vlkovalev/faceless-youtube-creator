const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const code = process.argv[2];
if (!code) {
  console.error("Usage: node exchange_saints_code.js <code>");
  process.exit(1);
}

const secretsFile = 'c:\\Users\\heliu\\Desktop\\WebSItes\\faceless-youtube-creator-clean\\automation\\credentials\\client_secrets.json';
const tokensFile = 'c:\\Users\\heliu\\Desktop\\WebSItes\\faceless-youtube-creator-clean\\The Saints\\automation\\credentials\\saints_oauth_tokens.json';

const secrets = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
const cfg = secrets.installed || secrets.web;

const oauth2Client = new OAuth2Client(
  cfg.client_id,
  cfg.client_secret,
  (cfg.redirect_uris || ['http://localhost'])[0]
);

async function run() {
  try {
    console.log("Exchanging code for tokens...");
    const { tokens } = await oauth2Client.getToken(code);
    console.log("Success! Received tokens.");
    
    // Backup the old tokens if they exist
    if (fs.existsSync(tokensFile)) {
      const backupFile = tokensFile.replace('.json', `.backup_${new Date().toISOString().replace(/:/g, '-')}.json`);
      fs.copyFileSync(tokensFile, backupFile);
      console.log("Backed up old tokens to:", backupFile);
    }
    
    fs.writeFileSync(tokensFile, JSON.stringify(tokens, null, 2), 'utf8');
    console.log("Successfully wrote new tokens to:", tokensFile);
  } catch (err) {
    console.error("Error exchanging code:", err.message);
  }
}

run();
