const fs = require('fs'); const path = require('path'); const { youtube: getYoutubeClient } = require('@googleapis/youtube'); const { OAuth2Client } = require('google-auth-library'); require('dotenv').config();
function readJsonFile(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')); }
async function main() {
  const videoId = process.argv[2] || 'ZloTBQbWyf4';
  const playlistId = process.argv[3] || 'PLNuBIVB7e5UoUFDds4rOK8dsfvK0T-Crn';
  const cdir=path.join(__dirname,'credentials'); const s=readJsonFile(path.join(cdir,'client_secrets.json')); const c=s.installed||s.web;
  const oauth2Client=new OAuth2Client(c.client_id,c.client_secret,c.redirect_uris[0]||'http://localhost:3000'); oauth2Client.setCredentials(readJsonFile(path.join(cdir,'oauth_tokens.json')));
  const youtube=getYoutubeClient({version:'v3', auth:oauth2Client});
  const items=await youtube.playlistItems.list({part:['snippet'], playlistId, maxResults:50});
  const exists=(items.data.items||[]).some(i=>i.snippet.resourceId?.videoId===videoId);
  let addedId = null;
  if (!exists) {
    const added=await youtube.playlistItems.insert({part:['snippet'], requestBody:{snippet:{playlistId, resourceId:{kind:'youtube#video', videoId}}}});
    addedId = added.data.id;
  }
  console.log(JSON.stringify({ playlistId, videoId, alreadyPresent: exists, addedId }, null, 2));
}
main().catch(e=>{ console.error(JSON.stringify(e.response?.data || e.message,null,2)); process.exit(1); });