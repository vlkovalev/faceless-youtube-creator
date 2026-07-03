const fs = require('fs');
const path = require('path');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');

const REPO_ROOT = path.resolve(__dirname, '..');
const SAINTS_ROOT = path.join(REPO_ROOT, 'The Saints');
const TOKENS_FILE = path.join(SAINTS_ROOT, 'automation', 'credentials', 'saints_oauth_tokens.json');
const SECRETS_FILE = path.join(REPO_ROOT, 'automation', 'credentials', 'client_secrets.json');
const STATUS_FILE = path.join(SAINTS_ROOT, 'metadata', 'thumbnail_upload_status.json');

const targetVideos = [
  { id: 1, youtubeId: 'XIzLFTHISuU', file: 'saints_thumbnail_video_1.png' },
  { id: 2, youtubeId: 'daKm2mA6KuQ', file: 'Thumbnails/saints_video_2_generated_cinematic.png' },
  { id: 3, youtubeId: 'JCuiQmFeWDA', file: 'Thumbnails/saints_video_3_generated_cinematic.png' },
  { id: 4, youtubeId: 'rPwzCS_r3SY', file: 'Thumbnails/saints_video_4_generated_cinematic.png' },
  { id: 5, youtubeId: 'T3nhxBl_l5w', file: 'Thumbnails/saints_video_5_generated_cinematic.png' },
  { id: 6, youtubeId: 'k06RYasoSMM', file: 'Thumbnails/saints_video_6_generated_cinematic.png' },
  { id: 7, youtubeId: 'oxUrxmoDtT4', file: 'Thumbnails/saints_video_7_generated_cinematic.png' },
  { id: 13, youtubeId: 'FL7ViGCtFHE', file: 'saints_thumbnail_video_13.png' },
  { id: 14, youtubeId: 'KFJvt0LUBxc', file: 'saints_thumbnail_video_14.png' },
  { id: 15, youtubeId: 'FzvYOU9EJXg', file: 'saints_thumbnail_video_15.png' },
  { id: 16, youtubeId: 'CJ0DvjOfxDc', file: 'saints_thumbnail_video_16.png' },
  { id: 17, youtubeId: 'TsfKDhOG44c', file: 'saints_thumbnail_video_17.png' },
  { id: 18, youtubeId: 'CVLT_zYt5XA', file: 'saints_thumbnail_video_18.png' },
  { id: 19, youtubeId: '_7Xo9aJhoBk', file: 'saints_thumbnail_video_19.png' },
  { id: 20, youtubeId: 'U4z3cBabcFM', file: 'saints_thumbnail_video_20.png' }
];


async function getYoutubeService() {
  const secretsData = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
  const webOrInstalled = secretsData.installed || secretsData.web;
  const { client_id, client_secret, redirect_uris } = webOrInstalled;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
  oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8')));
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

async function main() {
  console.log("--------------------------------------------------");
  console.log(`⏰ Executing saints thumbnail retry: ${new Date().toISOString()}`);
  console.log("--------------------------------------------------");

  if (!fs.existsSync(STATUS_FILE)) {
    console.error("Status file not found. Exiting.");
    return;
  }

  const status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
  const pendingVideos = targetVideos.filter(v => !status[v.youtubeId]);

  if (pendingVideos.length === 0) {
    console.log("🎉 All thumbnails have already been successfully uploaded!");
    return;
  }

  console.log(`Found ${pendingVideos.length} pending thumbnail uploads.`);
  const youtube = await getYoutubeService();
  let modified = false;

  for (const v of pendingVideos) {
    const thumbnailPath = path.join(SAINTS_ROOT, 'assets', v.file);
    if (!fs.existsSync(thumbnailPath)) {
      console.error(`Thumbnail file not found: ${thumbnailPath}`);
      continue;
    }

    try {
      console.log(`⏳ Uploading thumbnail for Saints ${v.id} (Video ID: ${v.youtubeId}, File: ${v.file})...`);
      await youtube.thumbnails.set({
        videoId: v.youtubeId,
        media: {
          mimeType: 'image/png',
          body: fs.createReadStream(thumbnailPath)
        }
      });
      console.log(`✅ Thumbnail for Saints ${v.id} uploaded successfully!`);
      status[v.youtubeId] = true;
      modified = true;
    } catch (err) {
      console.error(`🔴 Error uploading thumbnail for Saints ${v.id}:`, err.message);
      // Stop on quota error to prevent spamming the API
      if (err.message.includes("too many thumbnails") || err.message.includes("quota")) {
        console.warn("⚠️ Quota or upload limit reached. Stopping further attempts for this run.");
        break;
      }
    }
  }

  if (modified) {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');
    console.log("Updated upload status tracker file.");
  }
}

main().catch(console.error);
