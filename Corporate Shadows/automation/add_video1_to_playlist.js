const fs = require('fs'); const path = require('path'); const { youtube: getYoutubeClient } = require('@googleapis/youtube'); const { OAuth2Client } = require('google-auth-library'); require('dotenv').config();
function readJsonFile(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')); }
async function main() {
  const cdir=path.join(__dirname,'credentials'); const s=readJsonFile(path.join(cdir,'client_secrets.json')); const c=s.installed||s.web;
  const oauth2Client=new OAuth2Client(c.client_id,c.client_secret,c.redirect_uris[0]||'http://localhost:3000'); oauth2Client.setCredentials(readJsonFile(path.join(cdir,'oauth_tokens.json')));
  const youtube=getYoutubeClient({version:'v3', auth:oauth2Client});
  const playlistId='PLNuBIVB7e5UoUFDds4rOK8dsfvK0T-Crn'; const videoId='FCPe5Dlk_xw';
  const items=await youtube.playlistItems.list({part:['snippet'], playlistId, maxResults:50});
  console.log('items', (items.data.items||[]).map(i=>({id:i.id, videoId:i.snippet.resourceId?.videoId, title:i.snippet.title})));
  const exists=(items.data.items||[]).some(i=>i.snippet.resourceId?.videoId===videoId);
  if (!exists) {
    const added=await youtube.playlistItems.insert({part:['snippet'], requestBody:{snippet:{playlistId, resourceId:{kind:'youtube#video', videoId}}}});
    console.log('added', added.data.id);
  } else console.log('already exists');
}
main().catch(e=>{ console.error(JSON.stringify(e.response?.data || e.message,null,2)); process.exit(1); });