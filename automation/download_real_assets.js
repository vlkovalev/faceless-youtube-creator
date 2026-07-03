const fs = require('fs');
const path = require('path');
const https = require('https');

const destDir = path.join(__dirname, '..', 'assets', 'video_6_assets');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const assets = [
  {
    name: 'scene_1_b.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/f6/Arthur_M._Sackler.jpg'
  },
  {
    name: 'scene_2_b.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/2/22/OxyContin_branded_oxycodone_10mg_%28OC_side%29.jpg'
  },
  {
    name: 'scene_11_b.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/The_Temple_of_Dendur_MET_DT563.jpg'
  }
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, res => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', err => {
      file.close();
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

async function main() {
  console.log('--- Downloading Free Archival Public Domain Assets for Video 6 ---');
  for (const asset of assets) {
    const destPath = path.join(destDir, asset.name);
    console.log(`Downloading ${asset.name} from ${asset.url}...`);
    try {
      await downloadFile(asset.url, destPath);
      console.log(`[OK] Successfully downloaded ${asset.name}`);
    } catch (err) {
      console.error(`[ERROR] Failed to download ${asset.name}:`, err.message);
    }
  }
  console.log('All free archival assets successfully downloaded!');
}

main();
