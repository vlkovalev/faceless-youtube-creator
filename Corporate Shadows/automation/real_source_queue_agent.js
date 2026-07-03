/**
 * real_source_queue_agent.js
 *
 * Builds a priority queue of beats where generated visuals should be replaced
 * with real archival images from metadata/real_visual_source_library.json.
 *
 * Usage:
 *   node automation/real_source_queue_agent.js --video 1
 *   node automation/real_source_queue_agent.js --all
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIBRARY_PATH = path.join(ROOT, 'metadata', 'real_visual_source_library.json');
const OUT_PATH = path.join(ROOT, 'metadata', 'real_image_replacement_queue.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function loadPlan(videoId) {
  const planPath = path.join(ROOT, 'assets', `video_${videoId}_assets`, 'visual_plan.json');
  if (!fs.existsSync(planPath)) return null;
  return readJson(planPath);
}

function flattenBeats(plan) {
  const rows = [];
  for (const scene of plan.scenes || []) {
    for (const beat of scene.beats || []) {
      rows.push({
        scene_number: scene.scene_number,
        scene_title: scene.title,
        beat,
      });
    }
  }
  return rows;
}

function hasRealAsset(beat) {
  const file = String(beat.asset_file || beat.fallback || '');
  return /_(loc|commons|archive|real)\.(jpg|jpeg|png|webp)$/i.test(file) ||
    /\.(jpg|jpeg)$/i.test(file) && !/scene_\d+_image/i.test(file) && !/beat_\w+\.png$/i.test(file);
}

function isGeneratedLike(beat) {
  const file = String(beat.asset_file || beat.fallback || '');
  return beat.asset_type === 'generated_graphic' ||
    beat.status === 'pending_alt_image' ||
    /beat_[\w_]+\.png$/i.test(file) ||
    /scene_\d+_image\.png$/i.test(file);
}

function normalizeBeatId(beatId) {
  return String(beatId || '').replace(/_\d+$/, '');
}

function buildQueueForVideo(videoSpec) {
  const plan = loadPlan(videoSpec.video_id);
  if (!plan) return [];

  const beatRows = flattenBeats(plan);
  const queue = [];

  for (const source of videoSpec.real_source_priority || []) {
    const targetIds = new Set((source.replace_generated_beats || []).map(normalizeBeatId));

    for (const row of beatRows) {
      const normalized = normalizeBeatId(row.beat.beat_id);
      if (!targetIds.has(normalized)) continue;
      if (hasRealAsset(row.beat)) continue;
      if (!isGeneratedLike(row.beat)) continue;

      queue.push({
        video_id: videoSpec.video_id,
        video_title: videoSpec.title,
        scene_number: row.scene_number,
        scene_title: row.scene_title,
        beat_id: row.beat.beat_id,
        duration_s: row.beat.duration_s,
        current_asset: row.beat.asset_file || row.beat.fallback || null,
        narration_excerpt: row.beat.narration_excerpt,
        recommended_source_label: source.label,
        recommended_source_url: source.url,
        best_for: source.best_for,
        source_notes: source.notes || source.license_hint || source.rights_warning || '',
        suggested_filename: `assets/video_${videoSpec.video_id}_assets/beat_${row.beat.beat_id}_real.jpg`,
        status: 'needs_real_image',
      });
    }
  }

  const seen = new Set();
  return queue.filter(item => {
    const key = `${item.video_id}:${item.beat_id}:${item.recommended_source_url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.includes('--all')) return null;
  const idx = args.indexOf('--video');
  if (idx !== -1 && args[idx + 1]) return new Set(args[idx + 1].split(',').map(Number));
  const inline = args.find(arg => arg.startsWith('--video='));
  if (inline) return new Set(inline.replace('--video=', '').split(',').map(Number));
  return null;
}

function main() {
  const library = readJson(LIBRARY_PATH);
  const filter = parseArgs();
  const videos = (library.videos || []).filter(video => !filter || filter.has(video.video_id));
  const queue = videos.flatMap(buildQueueForVideo);

  const grouped = {};
  for (const item of queue) {
    grouped[item.video_id] = (grouped[item.video_id] || 0) + 1;
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify({
    created_at: new Date().toISOString(),
    purpose: 'Priority queue for replacing generated visuals with real archival images.',
    total_items: queue.length,
    by_video: grouped,
    queue,
  }, null, 2));

  console.log(`Real image replacement queue: ${queue.length} items`);
  Object.keys(grouped).sort().forEach(videoId => {
    console.log(`  Video ${videoId}: ${grouped[videoId]} replacements`);
  });
  console.log(OUT_PATH);
}

main();
