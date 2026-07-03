const fs = require('fs');
const path = require('path');
const https = require('https');

const WORKSPACE_DIR = 'c:\\\\Users\\\\heliu\\\\Desktop\\\\WebSItes\\\\faceless-youtube-creator-clean';
const USER_AGENT = 'CorporateShadowsAutoSourcer/2.0 (contact: admin@shadowempires.com; local production project)';

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        res.resume();
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
  });
}

function download(url, outPath, attempt = 1) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, res => {
      if (res.statusCode !== 200) {
        file.close();
        fs.rmSync(outPath, { force: true });
        if (res.statusCode === 429 && attempt < 4) {
          const waitMs = 5000 * attempt;
          console.log(`    Rate limited; waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 1}`);
          setTimeout(() => {
            download(url, outPath, attempt + 1).then(resolve).catch(reject);
          }, waitMs);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        }
        res.resume();
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', error => {
      file.close();
      fs.rmSync(outPath, { force: true });
      reject(error);
    });
  });
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function searchCommons(query) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url|mime|extmetadata&format=json&gsrsearch=${encodeURIComponent(query)}`;
  try {
    const data = await requestJson(url);
    const pages = data.query && data.query.pages ? Object.values(data.query.pages) : [];
    for (const page of pages) {
      const info = (page.imageinfo || [])[0];
      if (!info || !info.url || !/^image\//.test(info.mime || '') || /svg/i.test(info.mime || '')) continue;
      const meta = info.extmetadata || {};
      return {
        title: page.title,
        download_url: info.url,
        source_url: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_')),
        mime: info.mime,
        author: meta.Artist ? stripHtml(meta.Artist.value) : '',
        license: meta.LicenseShortName ? stripHtml(meta.LicenseShortName.value) : '',
        credit: 'Wikimedia Commons'
      };
    }
  } catch (e) {
    console.log(`  Search error for "${query}": ${e.message}`);
  }
  return null;
}

function extractArray(obj) {
  if (Array.isArray(obj)) return obj;
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj.value)) return extractArray(obj.value);
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) return extractArray(obj[key]);
    }
  }
  return [];
}

async function main() {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error('Usage: node auto_commons_sourcer.js <video_id>');
    process.exit(1);
  }

  const assetsDir = path.join(WORKSPACE_DIR, 'assets', `video_${videoId}_assets`);
  const planPath = path.join(assetsDir, 'visual_plan.json');
  const attributionPath = path.join(assetsDir, 'asset_attribution.json');

  if (!fs.existsSync(planPath)) {
    console.error(`Visual plan not found: ${planPath}`);
    process.exit(1);
  }

  const plan = readJson(planPath, {});
  let attribution = readJson(attributionPath, []);
  attribution = extractArray(attribution);

  console.log(`Auto-Sourcing Commons images for Video ${videoId}...`);
  let downloadedCount = 0;

  for (const scene of plan.scenes || []) {
    for (const beat of scene.beats || []) {
      if (beat.asset_type === 'wikimedia_commons' && (!beat.asset_file || beat.asset_file.includes('scene_') || beat.status === 'pending')) {
        const query = beat.search_query || beat.narration_excerpt;
        console.log(`[Beat ${beat.beat_id}] Searching: "${query}"`);
        let info = await searchCommons(query);
        
        const TOPIC_KEYWORDS = {
          4: 'sugar',
          5: 'East India Company',
          6: 'Sackler Purdue',
          8: 'Monsanto seed',
          9: 'Yahoo computer',
          10: 'gold mine'
        };
        
        if (!info) {
          const words = query.split(' ').slice(0, 3).join(' ');
          if (words.length > 3) {
            console.log(`  [Fallback 1] Searching: "${words}"`);
            info = await searchCommons(words);
          }
        }
        if (!info) {
          const topicKeyword = TOPIC_KEYWORDS[videoId] || '';
          const fallbackQuery = `${scene.title} ${topicKeyword}`.trim();
          console.log(`  [Fallback 2] Searching: "${fallbackQuery}"`);
          info = await searchCommons(fallbackQuery);
        }
        if (!info) {
          const topicKeyword = TOPIC_KEYWORDS[videoId] || '';
          console.log(`  [Fallback 3] Searching: "${topicKeyword}"`);
          info = await searchCommons(topicKeyword);
        }
        
        if (info) {
          const ext = info.mime.includes('png') ? '.png' : '.jpg';
          const fileName = `beat_${beat.beat_id}_real${ext}`;
          const destPath = path.join(assetsDir, fileName);
          console.log(`  Downloading image to ${fileName}...`);
          try {
            await download(info.download_url, destPath);
            beat.asset_file = `assets/video_${videoId}_assets/${fileName}`;
            beat.status = 'downloaded';
            beat.source_url = info.source_url;
            beat.selected_source_title = info.title;
            beat.selected_source_license = info.license || 'verify_on_file_page';
            beat.real_image_replacement = true;

            // Update attribution
            const attribIndex = attribution.findIndex(a => a.beat_id === beat.beat_id);
            const attribItem = {
              beat_id: beat.beat_id,
              scene: scene.title,
              file: `assets/video_${videoId}_assets/${fileName}`,
              source_url: info.source_url,
              download_url: info.download_url,
              title: info.title,
              author: info.author,
              license: info.license || 'verify_on_file_page',
              credit: 'Wikimedia Commons',
              replacement_reason: 'Replaced generated/static visual with real archival image'
            };
            if (attribIndex !== -1) {
              attribution[attribIndex] = attribItem;
            } else {
              attribution.push(attribItem);
            }

            downloadedCount++;
            console.log(`  [OK] Successfully downloaded ${fileName}`);
          } catch (e) {
            console.log(`  [ERROR] Failed to download ${info.download_url}: ${e.message}`);
          }
          await new Promise(r => setTimeout(r, 1500));
        } else {
          console.log(`  [WARN] No usable images found for query.`);
        }
      }
    }
  }

  writeJson(planPath, plan);
  writeJson(attributionPath, attribution);
  console.log(`\nAuto-sourcing complete for Video ${videoId}. Downloaded ${downloadedCount} images.`);
}

main();
