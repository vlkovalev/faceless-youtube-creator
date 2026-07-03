/**
 * source_video1_more_loc_real.js
 *
 * Adds more distinct real Library of Congress images to Video 1 and maps them
 * over repeated/generated beats. This is intentionally conservative: each
 * downloaded image is attribution-logged and every visual_plan entry keeps the
 * exact LOC item URL.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const VIDEO_ID = 1;
const ASSETS_DIR = path.join(ROOT, 'assets', `video_${VIDEO_ID}_assets`);
const PLAN_PATH = path.join(ASSETS_DIR, 'visual_plan.json');
const ATTR_PATH = path.join(ASSETS_DIR, 'asset_attribution.json');
const USER_AGENT = 'CorporateShadowsLOCRealSourcer/1.0';

const SPECS = [
  { beat: '1a', query: 'diamond ring', file: 'beat_1a_loc_more.jpg' },
  { beat: '1b', query: 'diamond jewelry', file: 'beat_1b_loc_more.jpg' },
  { beat: '1c', query: 'diamond close up', file: 'beat_1c_loc_more.jpg' },
  { beat: '1c_2', query: 'jewelry store window', file: 'beat_1c_2_loc_more.jpg' },
  { beat: '1c_3', query: 'engagement ring advertisement', file: 'beat_1c_3_loc_more.jpg' },
  { beat: '1d', query: 'diamond ring advertisement', file: 'beat_1d_loc_more.jpg' },
  { beat: '1d_2', query: 'jewelry advertisement ring', file: 'beat_1d_2_loc_more.jpg' },
  { beat: '2c', query: 'London office 1930s', file: 'beat_2c_loc_more.jpg' },
  { beat: '2d_2', query: 'business office 1930s', file: 'beat_2d_2_loc_more.jpg' },
  { beat: '2d_3', query: 'men office meeting 1930s', file: 'beat_2d_3_loc_more.jpg' },
  { beat: '5b', query: 'wedding ring advertisement', file: 'beat_5b_loc_more.jpg' },
  { beat: '5b_2', query: 'jewelry advertisement marriage', file: 'beat_5b_2_loc_more.jpg' },
  { beat: '5b_3', query: 'wedding jewelry advertisement', file: 'beat_5b_3_loc_more.jpg' },
  { beat: '6d', query: 'magazine advertisement jewelry', file: 'beat_6d_loc_more.jpg' },
  { beat: '6d_2', query: 'newspaper advertisement jewelry', file: 'beat_6d_2_loc_more.jpg' },
  { beat: '7d', query: 'Hollywood actress jewelry', file: 'beat_7d_loc_more.jpg' },
  { beat: '7d_2', query: 'movie star jewelry', file: 'beat_7d_2_loc_more.jpg' },
  { beat: '9d', query: 'diamond mine', file: 'beat_9d_loc_more.jpg' },
  { beat: '9d_2', query: 'mining South Africa', file: 'beat_9d_2_loc_more.jpg' },
  { beat: '11a', query: 'jewelry store interior', file: 'beat_11a_loc_more.jpg' },
  { beat: '11b', query: 'jewelry store', file: 'beat_11b_loc_more.jpg' },
  { beat: '11d', query: 'engagement ring advertisement', file: 'beat_11d_loc_more.jpg' },
  { beat: '11e', query: 'diamond ring advertisement', file: 'beat_11e_loc_more.jpg' },
  { beat: '11e_2', query: 'wedding ring advertisement', file: 'beat_11e_2_loc_more.jpg' },
  { beat: '11e_3', query: 'jewelry advertisement', file: 'beat_11e_3_loc_more.jpg' },
  { beat: '12a', query: 'diamond jewelry', file: 'beat_12a_loc_more.jpg' },
  { beat: '12a_2', query: 'jewelry store window', file: 'beat_12a_2_loc_more.jpg' },
  { beat: '12c', query: 'engagement ring', file: 'beat_12c_loc_more.jpg' },
  { beat: '12c_2', query: 'diamond ring', file: 'beat_12c_2_loc_more.jpg' }
];

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
    req.setTimeout(30000, () => req.destroy(new Error(`Timeout: ${url}`)));
  });
}

function download(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, res => {
      if (res.statusCode !== 200) {
        file.close();
        fs.rmSync(outPath, { force: true });
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
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
    req.setTimeout(60000, () => req.destroy(new Error(`Timeout: ${url}`)));
  });
}

async function locSearch(query, usedUrls) {
  const url = 'https://www.loc.gov/pictures/search/?fo=json&q=' + encodeURIComponent(query);
  const data = await requestJson(url);
  const results = data.results || [];

  for (const result of results) {
    if (!result.links || !result.links.resource) continue;
    let resourceUrl = result.links.resource;
    if (!/fo=json/.test(resourceUrl)) resourceUrl = resourceUrl.replace(/\/?$/, '/?fo=json');

    try {
      const detail = await requestJson(resourceUrl);
      const item = detail.item || {};
      const resource = detail.resource || {};
      const imageUrl = resource.larger || resource.medium || item.service_medium || item.image_url;
      if (!imageUrl || /notdig|\.gif/i.test(imageUrl) || usedUrls.has(imageUrl)) continue;
      if (!/\.(jpg|jpeg|png|tif|tiff)(\?|$)/i.test(imageUrl)) continue;
      return {
        title: item.title || result.title || query,
        item_url: item.link || result.links.item || resourceUrl,
        download_url: imageUrl,
        rights: item.rights_information || '',
        repository: item.repository || 'Library of Congress',
        date: item.date || '',
      };
    } catch {
      // Try next result.
    }
  }
  return null;
}

function findBeat(plan, beatId) {
  for (const scene of plan.scenes || []) {
    for (const beat of scene.beats || []) {
      if (String(beat.beat_id) === String(beatId)) return { scene, beat };
    }
  }
  return null;
}

async function main() {
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8').replace(/^\uFEFF/, ''));
  const attribution = fs.existsSync(ATTR_PATH)
    ? JSON.parse(fs.readFileSync(ATTR_PATH, 'utf8').replace(/^\uFEFF/, ''))
    : [];
  const usedUrls = new Set(attribution.map(row => row.download_url).filter(Boolean));
  let updated = 0;

  for (const spec of SPECS) {
    const hit = findBeat(plan, spec.beat);
    if (!hit) continue;

    try {
      const result = await locSearch(spec.query, usedUrls);
      if (!result) {
        console.log(`[miss] ${spec.beat}: ${spec.query}`);
        continue;
      }

      const outPath = path.join(ASSETS_DIR, spec.file);
      await download(result.download_url, outPath);
      if (fs.statSync(outPath).size < 1000) {
        fs.rmSync(outPath, { force: true });
        console.log(`[tiny] ${spec.beat}: ${spec.query}`);
        continue;
      }

      usedUrls.add(result.download_url);
      hit.beat.asset_file = `assets/video_${VIDEO_ID}_assets/${spec.file}`;
      hit.beat.status = 'downloaded';
      hit.beat.source_url = result.item_url;
      hit.beat.selected_source_title = result.title;
      hit.beat.selected_source_license = result.rights || 'Library of Congress; verify item page';
      hit.beat.real_image_replacement = true;

      attribution.push({
        beat_id: spec.beat,
        scene: hit.scene.title,
        file: `assets/video_${VIDEO_ID}_assets/${spec.file}`,
        source_url: result.item_url,
        download_url: result.download_url,
        title: result.title,
        author: result.repository,
        license: result.rights || 'Library of Congress; verify item page',
        date: result.date,
        credit: 'Library of Congress',
        replacement_reason: 'Added distinct real image to reduce generated/static repetition',
      });

      updated++;
      console.log(`[ok] ${spec.beat}: ${spec.file} <- ${result.title}`);
      await new Promise(resolve => setTimeout(resolve, 900));
    } catch (error) {
      console.log(`[error] ${spec.beat}: ${error.message}`);
    }
  }

  fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
  fs.writeFileSync(ATTR_PATH, JSON.stringify(attribution, null, 2));
  console.log(`Updated ${updated} Video 1 beats with additional LOC real images.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
