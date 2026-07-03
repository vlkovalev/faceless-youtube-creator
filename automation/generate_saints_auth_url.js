const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const secretsFile = 'c:\\Users\\heliu\\Desktop\\WebSItes\\faceless-youtube-creator-clean\\automation\\credentials\\client_secrets.json';
const secrets = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
const cfg = secrets.installed || secrets.web;

const oauth2Client = new OAuth2Client(
  cfg.client_id,
  cfg.client_secret,
  (cfg.redirect_uris || ['http://localhost'])[0]
);

const authorizeUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // Force consent so we get a refresh token
  scope: [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.force-ssl'
  ]
});

console.log("=================================================");
console.log("🔑 AUTHORIZATION REQUIRED FOR THE SAINTS CHANNEL");
console.log("=================================================");
console.log("1. Open the following URL in your browser:\n");
console.log(authorizeUrl);
console.log("\n2. Grant permissions and sign in.");
console.log("3. The browser will redirect to http://localhost/?code=...");
console.log("4. Copy the entire 'code' query parameter value from the address bar.");
console.log("5. Paste the code to exchange it for new tokens.");
console.log("=================================================");
