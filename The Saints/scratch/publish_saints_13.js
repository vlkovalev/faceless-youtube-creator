const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('../../automation/node_modules/@googleapis/youtube');
const { OAuth2Client } = require('../../automation/node_modules/google-auth-library');

const ROOT = 'c:\\Users\\heliu\\Desktop\\WebSItes\\faceless-youtube-creator-clean';
const SAINTS_CREDENTIALS_DIR = path.join(ROOT, 'The Saints', 'automation', 'credentials');
const SECRETS_FILE = path.join(ROOT, 'automation', 'credentials', 'client_secrets.json');
const TOKENS_FILE = path.join(SAINTS_CREDENTIALS_DIR, 'saints_oauth_tokens.json');

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
}

async function client() {
  const secretsData = readJsonFile(SECRETS_FILE);
  const webOrInstalled = secretsData.installed || secretsData.web;
  const { client_id, client_secret, redirect_uris } = webOrInstalled;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0] || 'http://localhost:3000');
  oauth2Client.setCredentials(readJsonFile(TOKENS_FILE));
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

async function main() {
  const youtube = await client();
  const videoId = '6Rhn9vk3Q5s';

  console.log(`Fetching video details for ${videoId}...`);
  const res = await youtube.videos.list({ part: ['snippet', 'status'], id: [videoId] });
  const item = res.data.items && res.data.items[0];
  if (!item) {
    throw new Error(`Video ${videoId} not found`);
  }

  console.log(`Original title: ${item.snippet.title}`);
  const newTitle = "Saint Ambrose of Optina: The Elder Who Answered Two Hundred Souls a Day";

  console.log(`Updating title and making public...`);
  await youtube.videos.update({
    part: ['snippet', 'status'],
    requestBody: {
      id: videoId,
      snippet: {
        title: newTitle,
        description: item.snippet.description,
        tags: item.snippet.tags || [],
        categoryId: item.snippet.categoryId || '27',
        defaultLanguage: item.snippet.defaultLanguage || 'en'
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false
      }
    }
  });

  console.log(`Successfully updated and published video ${videoId}!`);
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
