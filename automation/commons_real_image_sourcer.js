/**
 * commons_real_image_sourcer.js
 *
 * Downloads real Wikimedia Commons images for items in
 * metadata/real_image_replacement_queue.json and updates visual_plan.json.
 *
 * Usage:
 *   node automation/commons_real_image_sourcer.js --video 1 --limit 25
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'metadata', 'real_image_replacement_queue.json');
const USER_AGENT = 'CorporateShadowsRealImageSourcer/1.0 (contact: admin@shadowempires.com; local production project)';

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
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
    req.setTimeout(30000, () => {
      req.destroy(new Error(`Timeout: ${url}`));
    });
  });
}

function download(url, outPath, attempt) {
  const currentAttempt = attempt || 1;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, res => {
      if (res.statusCode !== 200) {
        file.close();
        fs.rmSync(outPath, { force: true });
        if (res.statusCode === 429 && currentAttempt < 4) {
          const waitMs = 5000 * currentAttempt;
          console.log(`    Rate limited; waiting ${Math.round(waitMs / 1000)}s before retry ${currentAttempt + 1}`);
          setTimeout(() => {
            download(url, outPath, currentAttempt + 1).then(resolve).catch(reject);
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
    req.setTimeout(60000, () => {
      req.destroy(new Error(`Timeout: ${url}`));
    });
  });
}

function commonsTitleFromUrl(url) {
  const match = String(url || '').match(/commons\.wikimedia\.org\/wiki\/([^?#]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]).replace(/_/g, ' ');
}

function extensionFromMime(mime) {
  if (/png/i.test(mime)) return '.png';
  if (/webp/i.test(mime)) return '.webp';
  return '.jpg';
}

async function getCategoryFiles(categoryTitle, limit) {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtype=file&format=json&cmlimit=' +
    encodeURIComponent(String(limit)) + '&cmtitle=' + encodeURIComponent(categoryTitle);
  const data = await requestJson(api);
  return ((data.query && data.query.categorymembers) || []).map(item => item.title);
}

async function getFileInfo(title) {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|mime|extmetadata&format=json&titles=' +
    encodeURIComponent(title);
  const data = await requestJson(api);
  const pages = data.query && data.query.pages ? Object.values(data.query.pages) : [];
  const page = pages[0] || {};
  const info = (page.imageinfo || [])[0];
  if (!info || !info.url || !/^image\//.test(info.mime || '') || /svg/i.test(info.mime || '')) return null;

  const meta = info.extmetadata || {};
  return {
    title,
    download_url: info.url,
    source_url: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')),
    mime: info.mime,
    author: meta.Artist ? stripHtml(meta.Artist.value) : '',
    license: meta.LicenseShortName ? stripHtml(meta.LicenseShortName.value) : '',
    credit: 'Wikimedia Commons',
  };
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function imagePoolForSource(sourceUrl, needed) {
  const title = commonsTitleFromUrl(sourceUrl);
  if (!title) return [];

  const titles = title.startsWith('Category:')
    ? await getCategoryFiles(title, Math.max(needed * 3, 30))
    : [title];

  const pool = [];
  for (const fileTitle of titles) {
    try {
      const info = await getFileInfo(fileTitle);
      if (info) pool.push(info);
      if (pool.length >= needed) break;
    } catch {
      // Continue with the next image; Commons categories often include odd files.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return pool;
}

function findBeat(plan, beatId) {
  for (const scene of plan.scenes || []) {
    for (const beat of scene.beats || []) {
      if (String(beat.beat_id) === String(beatId)) return { scene, beat };
    }
  }
  return null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = flag => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };
  return {
    videoId: Number(get('--video') || get('--video-id') || 1),
    limit: Number(get('--limit') || 20),
  };
}

async function main() {
  const { videoId, limit } = parseArgs();
  const queueData = readJson(QUEUE_PATH, { queue: [] });
  const items = queueData.queue
    .filter(item => item.video_id === videoId)
    .filter(item => /commons\.wikimedia\.org/.test(item.recommended_source_url || ''))
    .slice(0, limit);

  const planPath = path.join(ROOT, 'assets', `video_${videoId}_assets`, 'visual_plan.json');
  const attributionPath = path.join(ROOT, 'assets', `video_${videoId}_assets`, 'asset_attribution.json');
  const assetsDir = path.join(ROOT, 'assets', `video_${videoId}_assets`);
  const plan = readJson(planPath);
  let attribution = readJson(attributionPath, []);
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
  attribution = extractArray(attribution);

  console.log(`Commons real-image sourcing: video ${videoId}, ${items.length} queue items`);

  const bySource = new Map();
  for (const item of items) {
    const list = bySource.get(item.recommended_source_url) || [];
    list.push(item);
    bySource.set(item.recommended_source_url, list);
  }

  let downloaded = 0;
  for (const [sourceUrl, sourceItems] of bySource.entries()) {
    console.log(`\nSource: ${sourceUrl}`);
    const pool = await imagePoolForSource(sourceUrl, sourceItems.length);
    console.log(`  Found usable images: ${pool.length}`);

    for (let i = 0; i < sourceItems.length && i < pool.length; i++) {
      const item = sourceItems[i];
      const info = pool[i];
      const hit = findBeat(plan, item.beat_id);
      if (!hit) continue;

      const ext = extensionFromMime(info.mime);
      const fileName = `beat_${item.beat_id}_real${ext}`;
      const outPath = path.join(assetsDir, fileName);

      try {
        await download(info.download_url, outPath);
      } catch (error) {
        console.log(`  [${item.beat_id}] download skipped: ${error.message}`);
        continue;
      }

      hit.beat.asset_file = `assets/video_${videoId}_assets/${fileName}`;
      hit.beat.status = 'downloaded';
      hit.beat.source_url = info.source_url;
      hit.beat.selected_source_title = info.title;
      hit.beat.selected_source_license = info.license || 'verify_on_file_page';
      hit.beat.real_image_replacement = true;

      attribution.push({
        beat_id: item.beat_id,
        scene: item.scene_title,
        file: `assets/video_${videoId}_assets/${fileName}`,
        source_url: info.source_url,
        download_url: info.download_url,
        title: info.title,
        author: info.author,
        license: info.license || 'verify_on_file_page',
        credit: info.credit,
        replacement_reason: 'Replaced generated/static visual with real archival image',
      });

      downloaded++;
      console.log(`  [${item.beat_id}] ${fileName} <- ${info.title}`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  writeJson(planPath, plan);
  writeJson(attributionPath, attribution);
  console.log(`\nDownloaded and mapped ${downloaded} real images for video ${videoId}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
