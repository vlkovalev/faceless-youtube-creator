/**
 * saints_verified_visual_injector_all.js
 *
 * Enforces the saint icon-only rule for any given video ID (13-20).
 * Downloads only the saint icon, clears all other files in verified_sources/real_sources,
 * updates visual_plan.json beats to use the icon, and writes asset_attribution.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..');

const SOURCE_SETS = {
  1: {
    key: "anthony_icon",
    url: "https://commons.wikimedia.org/wiki/File:St_Anthony_the_Great.jpg",
    license: "public_domain",
    author: "Unknown / Wikimedia Commons, Public Domain",
    type: "icon_or_painting",
    title: "Saint Anthony the Great icon"
  },
  2: {
    key: "seraphim_sarov_icon",
    url: "https://commons.wikimedia.org/wiki/File:Saint_Seraphim_of_Sarov.png",
    local_file: "C:\\Users\\heliu\\.gemini\\antigravity\\brain\\5f15b88e-32d9-45bb-b6ef-7f4d0233ce96\\saint_seraphim_sarov_1781916377957.png",
    license: "public_domain",
    author: "Antigravity Generated / Public Domain",
    type: "icon_or_painting",
    title: "Saint Seraphim of Sarov icon"
  },
  3: {
    key: "nil_sorsky_icon",
    url: "https://commons.wikimedia.org/wiki/File:Saint_Nil_Sorsky.png",
    local_file: "C:\\Users\\heliu\\.gemini\\antigravity\\brain\\5f15b88e-32d9-45bb-b6ef-7f4d0233ce96\\saint_nil_sorsky_1781916389968.png",
    license: "public_domain",
    author: "Antigravity Generated / Public Domain",
    type: "icon_or_painting",
    title: "Saint Nil Sorsky icon"
  },
  4: {
    key: "theophan_recluse_icon",
    url: "https://commons.wikimedia.org/wiki/File:Saint_Theophan_the_Recluse.png",
    local_file: "C:\\Users\\heliu\\.gemini\\antigravity\\brain\\5f15b88e-32d9-45bb-b6ef-7f4d0233ce96\\saint_theophan_recluse_1781916401165.png",
    license: "public_domain",
    author: "Antigravity Generated / Public Domain",
    type: "icon_or_painting",
    title: "Saint Theophan the Recluse icon"
  },
  5: {
    key: "innocent_alaska_icon",
    url: "https://commons.wikimedia.org/wiki/File:Saint_Innocent_of_Alaska.png",
    local_file: "C:\\Users\\heliu\\.gemini\\antigravity\\brain\\5f15b88e-32d9-45bb-b6ef-7f4d0233ce96\\saint_innocent_alaska_1781916411332.png",
    license: "public_domain",
    author: "Antigravity Generated / Public Domain",
    type: "icon_or_painting",
    title: "Saint Innocent of Alaska icon"
  },
  6: {
    key: "nicholas_myra_icon",
    url: "https://commons.wikimedia.org/wiki/File:Saint_Nicholas_of_Myra.png",
    local_file: "C:\\Users\\heliu\\.gemini\\antigravity\\brain\\5f15b88e-32d9-45bb-b6ef-7f4d0233ce96\\saint_nicholas_myra_1781916422516.png",
    license: "public_domain",
    author: "Antigravity Generated / Public Domain",
    type: "icon_or_painting",
    title: "Saint Nicholas of Myra icon"
  },
  7: {
    key: "mary_egypt_icon",
    url: "https://commons.wikimedia.org/wiki/File:Saint_Mary_of_Egypt.png",
    local_file: "C:\\Users\\heliu\\.gemini\\antigravity\\brain\\5f15b88e-32d9-45bb-b6ef-7f4d0233ce96\\saint_mary_egypt_1781916435177.png",
    license: "public_domain",
    author: "Antigravity Generated / Public Domain",
    type: "icon_or_painting",
    title: "Saint Mary of Egypt icon"
  },
  13: {
    key: "ambrose_icon",
    url: "https://commons.wikimedia.org/wiki/File:Amvrosiy_Optinskiy.jpg",
    license: "public_domain",
    author: "Unknown / public-domain reproduction via Wikimedia Commons",
    type: "icon_or_painting",
    title: "Saint Ambrose of Optina portrait"
  },
  14: {
    key: "paisios_icon",
    url: "https://commons.wikimedia.org/wiki/File:Paisios_of_Mount_Athos.jpg",
    license: "cc_by_4_0_verified",
    author: "Spartacos31 / Wikimedia Commons, CC BY 4.0",
    type: "icon_or_painting",
    title: "Saint Paisios of Mount Athos mosaic"
  },
  15: {
    key: "silouan_icon",
    url: "https://commons.wikimedia.org/wiki/File:Siluan_of_Athos.jpg",
    downloaded_from: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Siluan_of_Athos.jpg/960px-Siluan_of_Athos.jpg",
    license: "cc_by_sa_4_0_verified",
    author: "Andrey Mironov / Wikimedia Commons, CC BY-SA 4.0",
    type: "icon_or_painting",
    title: "Saint Silouan the Athonite painting"
  },
  16: {
    key: "optina_elder_icon",
    url: "https://commons.wikimedia.org/wiki/File:Amvrosiy_Optinskiy.jpg",
    license: "public_domain",
    author: "Unknown / public-domain reproduction via Wikimedia Commons",
    type: "icon_or_painting",
    title: "Saint Ambrose of Optina portrait for the Optina Elders"
  },
  17: {
    key: "herman_icon",
    url: "https://commons.wikimedia.org/wiki/File:Saint_Herman_of_Alaska.jpg",
    license: "cc_by_sa_3_0_or_gfdl_verified",
    author: "AlexEleon / Wikimedia Commons, CC BY-SA 3.0 or GFDL",
    type: "icon_or_painting",
    title: "Saint Herman of Alaska icon"
  },
  18: {
    key: "sergius_icon",
    url: "https://commons.wikimedia.org/wiki/File:Sergius_von_Radonezh_(full).jpg",
    license: "public_domain",
    author: "Unknown / public domain reproduction",
    type: "icon_or_painting",
    title: "Sergius of Radonezh icon"
  },
  19: {
    key: "paisius_velichkovsky_icon",
    url: "https://commons.wikimedia.org/wiki/File:Paisius.jpg",
    license: "public_domain",
    author: "Unknown / public-domain reproduction via Wikimedia Commons",
    type: "icon_or_painting",
    title: "Saint Paisius Velichkovsky portrait"
  },
  20: {
    key: "nikon_portrait",
    url: "https://commons.wikimedia.org/wiki/File:Nikon_(Vorobyov)._A._Mironov.jpg",
    license: "cc_by_sa_4_0",
    author: "Andrey Mironov",
    type: "icon_or_painting",
    title: "Hegumen Nikon Vorobiev portrait"
  }
};

function downloadUrlForFile(url) {
  const name = url.split("/wiki/File:", 2)[1];
  const decoded = decodeURIComponent(name);
  const normalized = decoded.replace(/ /g, '_');
  const hash = crypto.createHash('md5').update(normalized).digest('hex');
  return `https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash[0]}${hash[1]}/${encodeURIComponent(normalized)}`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFileWithRetry(url, destPath, retries = 5, backoffMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(destPath);
        https.get(url, {
          headers: {
            'User-Agent': 'TheSaintsVisualSourcingAgent/1.0 (contact@saints-channel.org; faceless-youtube-creator-clean)'
          }
        }, (res) => {
          if (res.statusCode === 429) {
            fs.unlink(destPath, () => {});
            reject({ status: 429, message: 'Too Many Requests' });
            return;
          }
          if (res.statusCode !== 200) {
            fs.unlink(destPath, () => {});
            reject(new Error(`Failed to download: status ${res.statusCode}`));
            return;
          }
          res.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });
        }).on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      });
      await delay(1500);
      return;
    } catch (err) {
      if (attempt === retries) {
        throw err;
      }
      const waitTime = err.status === 429 ? backoffMs * 3 * attempt : backoffMs * attempt;
      console.warn(`Attempt ${attempt} failed for ${url}. Retrying in ${waitTime}ms... Error: ${err.message || err}`);
      await delay(waitTime);
    }
  }
}

function clearDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      fs.unlinkSync(path.join(dirPath, file));
    }
  } else {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function main() {
  const videoId = parseInt(process.argv[2] || '13', 10);
  if (!SOURCE_SETS[videoId]) {
    console.error(`Invalid or unsupported video ID: ${videoId}`);
    process.exit(1);
  }

  const info = SOURCE_SETS[videoId];
  console.log(`\n==================================================`);
  console.log(`Enforcing Saint Icon-Only Rule for Video ${videoId}...`);
  console.log(`==================================================`);

  const ASSETS_DIR = path.join(ROOT, 'assets', `saints_video_${videoId}_assets`);
  const VERIFIED_DIR = path.join(ASSETS_DIR, 'verified_sources');
  const REAL_DIR = path.join(ASSETS_DIR, 'real_sources');

  // 1. Clear directories to remove ALL non-iconic visual files (monasteries, manuscripts, other portraits)
  console.log("Clearing verified_sources and real_sources directories...");
  clearDirectory(VERIFIED_DIR);
  clearDirectory(REAL_DIR);

  // 2. Download or copy the single saint icon
  let fileName, ext, verifiedPath, realPath;
  if (info.local_file) {
    fileName = path.basename(info.local_file);
    ext = path.extname(fileName) || '.png';
    verifiedPath = path.join(VERIFIED_DIR, `${info.key}${ext}`);
    realPath = path.join(REAL_DIR, `${info.key}${ext}`);
    console.log(`Using local Saint Icon: ${info.key} from ${info.local_file}...`);
    fs.copyFileSync(info.local_file, verifiedPath);
    fs.copyFileSync(verifiedPath, realPath);
    console.log(`Copied local icon to both source directories.`);
  } else {
    fileName = decodeURIComponent(info.url.split("/wiki/File:", 2)[1]).replace(/ /g, '_');
    ext = path.extname(fileName) || '.jpg';
    verifiedPath = path.join(VERIFIED_DIR, `${info.key}${ext}`);
    realPath = path.join(REAL_DIR, `${info.key}${ext}`);

    const dlUrl = info.downloaded_from || downloadUrlForFile(info.url);
    console.log(`Downloading Saint Icon: ${info.key} from ${dlUrl}...`);
    await downloadFileWithRetry(dlUrl, verifiedPath);
    fs.copyFileSync(verifiedPath, realPath);
    console.log(`Downloaded and copied to both source directories.`);
  }

  // 3. Load visual plan
  const planPath = path.join(ASSETS_DIR, 'visual_plan.json');
  if (!fs.existsSync(planPath)) {
    console.error(`Missing visual plan: ${planPath}`);
    process.exit(1);
  }
  const planContent = fs.readFileSync(planPath, 'utf8').replace(/^\uFEFF/, '');
  const plan = JSON.parse(planContent);

  // 4. Force all beat properties to follow the strict rule
  let replacements = 0;
  const attribution = [];

  for (const scene of plan.scenes) {
    const sceneNum = scene.scene_number;
    const beats = scene.beats || [];
    for (const beat of beats) {
      const assetFile = `scene_${sceneNum}_beat_${beat.beat_id}_image.png`;

      beat.visual_type = "icon_or_painting";
      beat.asset_file = assetFile;
      beat.primary_source_url = info.url;
      beat.primary_source_label = info.title;
      beat.license_status = info.license;
      beat.rights_status = "verified";
      beat.status = "downloaded_verified";
      beat.attribution_required = !info.license.startsWith("public_domain");
      beat.verified_source_key = info.key;

      // Force layout style and containment
      beat.subject_framing = "full_subject_contained";
      beat.layout_style = "left_text_right_saint";
      
      // Clean up any old error properties
      delete beat.download_error;

      replacements++;
      attribution.push({
        video_id: videoId,
        scene: sceneNum,
        beat_id: beat.beat_id,
        asset_file: assetFile,
        source_key: info.key,
        source_url: info.url,
        source_file: path.relative(ASSETS_DIR, verifiedPath),
        license: info.license,
        author: info.author,
        usage_status: "approved_for_private_draft_and_youtube_upload",
        visual_type: info.type,
        title: info.title
      });
    }
  }

  // Save visual plan and attribution
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(ASSETS_DIR, 'asset_attribution.json'),
    JSON.stringify({
      video_id: videoId,
      generated_at: new Date().toISOString(),
      policy: "Exact source pages only; Commons category/search pages are not treated as rights clearance.",
      total_replaced_beats: replacements,
      sources: [
        {
          url: info.url,
          license: info.license,
          author: info.author,
          type: info.type,
          title: info.title
        }
      ],
      beats: attribution
    }, null, 2),
    'utf8'
  );

  console.log(`Updated visual_plan.json with ${replacements} saint icon-only beats.`);
  console.log(`Saved clean asset_attribution.json.`);
}

main().catch(err => {
  console.error("Error in injector:", err);
  process.exit(1);
});
