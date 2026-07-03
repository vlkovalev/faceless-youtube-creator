/**
 * map_video1_existing_real_assets.js
 *
 * Maps already-downloaded real LOC/Commons/JPG assets into the densified
 * Video 1 visual plan so real images are preferred over generated cards.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VIDEO_ID = 1;
const ASSETS_DIR = path.join(ROOT, 'assets', `video_${VIDEO_ID}_assets`);
const PLAN_PATH = path.join(ASSETS_DIR, 'visual_plan.json');

const REAL_ASSET_ROTATION = {
  '1a': ['beat_12b_loc.jpg', 'beat_11c_loc.jpg'],
  '1b': ['beat_12b_loc.jpg', 'beat_11c_loc.jpg'],
  '1c': ['beat_12b_loc.jpg', 'beat_11c_loc.jpg'],
  '1d': ['beat_12b_loc.jpg'],
  '2a': ['beat_2b_loc.jpg', 'beat_3b_real.jpg'],
  '2b': ['beat_2b_loc.jpg', 'beat_3b_real.jpg'],
  '2c': ['beat_2b_loc.jpg'],
  '2d': ['beat_2b_loc.jpg'],
  '3a': ['beat_3a_loc.jpg', 'beat_4a_loc.jpg', 'beat_3b_real.jpg'],
  '3b': ['beat_3b_real.jpg', 'beat_3b_loc.jpg', 'beat_4a_loc.jpg'],
  '3c': ['beat_3b_loc.jpg', 'beat_3a_loc.jpg', 'beat_4a_loc.jpg'],
  '3d': ['beat_3a_loc.jpg', 'beat_3b_loc.jpg', 'beat_4a_loc.jpg'],
  '3e': ['beat_3a_loc.jpg', 'beat_4a_loc.jpg'],
  '4a': ['beat_4a_loc.jpg', 'beat_3b_real.jpg'],
  '4b': ['beat_2b_loc.jpg', 'beat_4a_loc.jpg'],
  '4c': ['beat_4c_loc.jpg', 'beat_2b_loc.jpg'],
  '4d': ['beat_5a_loc.jpg', 'beat_4c_loc.jpg'],
  '4e': ['beat_4c_loc.jpg', 'beat_5a_loc.jpg'],
  '5a': ['beat_5a_loc.jpg', 'beat_4c_loc.jpg'],
  '5b': ['beat_5a_loc.jpg', 'beat_12b_loc.jpg'],
  '5c': ['beat_5a_loc.jpg'],
  '6a': ['beat_4c_loc.jpg', 'beat_2b_loc.jpg'],
  '6b': ['beat_4c_loc.jpg'],
  '6c': ['beat_4c_loc.jpg'],
  '7a': ['beat_7b_commons.jpg', 'beat_4c_loc.jpg'],
  '7b': ['beat_7b_commons.jpg'],
  '7c': ['beat_7b_commons.jpg', 'beat_4c_loc.jpg'],
  '8a': ['beat_3a_loc.jpg', 'beat_3b_loc.jpg'],
  '8b': ['beat_3b_loc.jpg', 'beat_3a_loc.jpg'],
  '8c': ['beat_4a_loc.jpg', 'beat_3b_loc.jpg'],
  '8d': ['beat_3b_loc.jpg'],
  '8e': ['beat_3a_loc.jpg'],
  '9a': ['beat_9b.png'],
  '9b': ['beat_9b.png'],
  '9c': ['beat_9c.png'],
  '9d': ['beat_3a_loc.jpg', 'beat_4a_loc.jpg'],
  '10a': ['beat_10a.png'],
  '10b': ['beat_10b.png'],
  '10c': ['beat_10c.png'],
  '11a': ['beat_11c_loc.jpg', 'beat_12b_loc.jpg'],
  '11b': ['beat_11c_loc.jpg'],
  '11c': ['beat_11c_loc.jpg'],
  '11d': ['beat_11c_loc.jpg'],
  '11e': ['beat_12b_loc.jpg', 'beat_11c_loc.jpg'],
  '12a': ['beat_12b_loc.jpg', 'beat_11c_loc.jpg'],
  '12b': ['beat_12b_loc.jpg'],
  '12c': ['beat_12b_loc.jpg', 'beat_11c_loc.jpg']
};

function baseId(beatId) {
  return String(beatId || '').replace(/_\d+$/, '');
}

function realFileExists(fileName) {
  return fileName && fs.existsSync(path.join(ASSETS_DIR, fileName)) && fs.statSync(path.join(ASSETS_DIR, fileName)).size > 1000;
}

const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8').replace(/^\uFEFF/, ''));
let updated = 0;

for (const scene of plan.scenes || []) {
  for (const beat of scene.beats || []) {
    const options = REAL_ASSET_ROTATION[baseId(beat.beat_id)] || [];
    const indexMatch = String(beat.beat_id).match(/_(\d+)$/);
    const offset = indexMatch ? Number(indexMatch[1]) - 1 : 0;
    const ordered = options.slice(offset).concat(options.slice(0, offset));
    const selected = ordered.find(realFileExists);
    if (!selected) continue;

    beat.asset_file = `assets/video_${VIDEO_ID}_assets/${selected}`;
    beat.status = 'downloaded';
    beat.real_preferred_mapping = true;
    beat.selected_source_license = beat.selected_source_license || 'verify_existing_asset_attribution';
    updated++;
  }
}

fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
console.log(`Mapped ${updated} Video 1 beats to existing real/preferred assets.`);
