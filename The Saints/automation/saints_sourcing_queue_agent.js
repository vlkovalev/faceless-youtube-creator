/**
 * saints_sourcing_queue_agent.js
 *
 * Builds a prioritized real-asset sourcing queue from Saints visual plans.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VIDEOS = process.argv.slice(2).length
  ? process.argv.slice(2).map(Number).filter(Boolean)
  : [13, 14, 15, 16, 17, 18, 19];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function getValue(beat, key) {
  return beat[key] || (beat.recommendation && beat.recommendation[key]) || null;
}

function main() {
  const items = [];

  for (const id of VIDEOS) {
    const planPath = path.join(ROOT, 'assets', `saints_video_${id}_assets`, 'visual_plan.json');
    if (!fs.existsSync(planPath)) continue;
    const plan = readJson(planPath);

    for (const scene of plan.scenes || []) {
      for (const beat of scene.beats || []) {
        const priority = Number(getValue(beat, 'source_priority') || 9);
        if (priority > 2) continue;

        items.push({
          video_id: `SAINTS-${String(id).padStart(3, '0')}`,
          beat_id: beat.beat_id,
          scene: scene.title,
          visual_type: getValue(beat, 'visual_type'),
          source_label: getValue(beat, 'primary_source_label'),
          source_url: getValue(beat, 'primary_source_url'),
          backup_source_url: getValue(beat, 'backup_source_url'),
          search_query: getValue(beat, 'search_query'),
          priority,
          status: 'needed'
        });
      }
    }
  }

  items.sort((a, b) => a.priority - b.priority || a.video_id.localeCompare(b.video_id) || String(a.beat_id).localeCompare(String(b.beat_id)));

  const out = {
    updated_at: new Date().toISOString(),
    purpose: 'Prioritized real visual asset sourcing queue for The Saints episodes.',
    rules: [
      'Prefer verified icons, paintings, monastery/location photos, manuscripts, and portraits.',
      'Record exact source file page and license in asset_attribution.json.',
      'Use generated atmospheric cards only where real sources are unsuitable.'
    ],
    videos: VIDEOS.map(id => `SAINTS-${String(id).padStart(3, '0')}`),
    count: items.length,
    items
  };

  const outPath = path.join(ROOT, 'metadata', 'saints_visual_sourcing_queue.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${items.length} priority sourcing items to ${outPath}`);
}

main();
