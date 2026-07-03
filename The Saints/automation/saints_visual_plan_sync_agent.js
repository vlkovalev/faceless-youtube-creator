/**
 * saints_visual_plan_sync_agent.js
 *
 * Adds missing scenes from a Saints script into its visual_plan.json so expanded
 * scripts can render without hand-patching. Existing scenes are preserved.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { SAINTS_ROOT } = require('./channel_paths');

const ROOT = SAINTS_ROOT;
const id = process.argv[2];
if (!id) throw new Error('Usage: node automation/saints_visual_plan_sync_agent.js <video_id>');

const scriptPath = path.join(ROOT, 'scripts', `saints_video_${id}_data.js`);
const assetDir = path.join(ROOT, 'assets', `saints_video_${id}_assets`);
const planPath = path.join(assetDir, 'visual_plan.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function loadAttributionMap() {
  const attrPath = path.join(assetDir, 'asset_attribution.json');
  if (!fs.existsSync(attrPath)) return new Map();
  const raw = readJson(attrPath);
  const beats = Array.isArray(raw) ? raw : (Array.isArray(raw.beats) ? raw.beats : []);
  return new Map(
    beats
      .filter(item => item && item.scene != null && item.beat_id != null)
      .map(item => [`${item.scene}:${item.beat_id}`, item])
  );
}

function loadScript() {
  const raw = fs.readFileSync(scriptPath, 'utf8').replace(/^\uFEFF/, '');
  const match = raw.match(new RegExp(`window\\.SAINTS_SCRIPTS\\[${id}\\]\\s*=\\s*(\\{[\\s\\S]+\\})\\s*;?\\s*$`));
  if (!match) throw new Error(`Could not parse Saints script ${id}`);
  return JSON.parse(match[1]);
}

function excerpt(text, max = 155) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max).trim() + '...';
}

function chunks(text, count) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const groups = Array.from({ length: count }, () => []);
  sentences.forEach((s, i) => groups[Math.min(count - 1, Math.floor(i * count / Math.max(1, sentences.length)))].push(s));
  return groups.map(g => g.join(' ')).filter(Boolean);
}

function makeScene(scene, start) {
  const parts = chunks(scene.voiceover, 3);
  const duration = Math.max(36, Math.round(String(scene.voiceover || '').split(/\s+/).filter(Boolean).length / 2.25));
  const beatDuration = Math.max(8, Math.round(duration / parts.length));
  const beats = parts.map((part, idx) => {
    const suffix = String.fromCharCode(97 + idx);
    const visualType = idx === 0 ? 'icon_or_painting' : idx === 1 ? 'manuscript_book_or_letter' : 'monastery_or_location';
    return {
      beat_id: `${scene.scene_number}${suffix}`,
      start_s: start + idx * beatDuration,
      duration_s: idx === parts.length - 1 ? Math.max(8, duration - beatDuration * idx) : beatDuration,
      narration_excerpt: excerpt(part),
      visual_type: visualType,
      asset_note: visualType === 'icon_or_painting' ? 'Use verified saint icon, portrait, or reverent public-domain religious art.' : visualType === 'manuscript_book_or_letter' ? 'Use manuscripts, old books, maps, letters, or source-document visuals.' : 'Use monastery, pilgrimage, geographic, or landscape imagery tied to the saint.',
      primary_source_label: 'Wikimedia Commons verified file search',
      primary_source_url: `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(scene.title + ' saint orthodox public domain')}&title=Special:MediaSearch&type=image`,
      backup_source_url: 'https://commons.wikimedia.org/',
      search_query: `${scene.title} saint orthodox public domain Wikimedia Commons`,
      source_priority: 2,
      asset_file: null,
      attribution_required: true,
      license_status: 'verify_per_file_before_use',
      status: 'pending',
      fallback: `scene_${scene.scene_number}_image.png`,
      suggested_filename: `beat_${scene.scene_number}${suffix}.jpg`
    };
  });
  return {
    scene_number: scene.scene_number,
    title: scene.title,
    start_s: start,
    duration_s: duration,
    beat_count: beats.length,
    visual_prompt: scene.visual_prompt,
    primary_asset_file: `scene_${scene.scene_number}_image.png`,
    beats
  };
}

function overlayAttribution(plan, attribution) {
  let synced = 0;
  for (const scene of plan.scenes || []) {
    for (const beat of scene.beats || []) {
      const attr = attribution.get(`${scene.scene_number}:${beat.beat_id}`);
      if (!attr) continue;
      beat.asset_file = attr.asset_file || beat.asset_file;
      beat.primary_source_url = attr.source_url || beat.primary_source_url;
      beat.primary_source_label = attr.title || beat.primary_source_label;
      beat.license_status = attr.license || beat.license_status;
      beat.rights_status = 'verified';
      beat.status = 'downloaded_verified';
      beat.verified_source_key = attr.source_key || beat.verified_source_key;
      beat.attribution_required = Boolean(attr.license && !String(attr.license).startsWith('public_domain'));
      beat.visual_type = attr.visual_type || beat.visual_type;
      if (String(beat.visual_type).toLowerCase() === 'icon_or_painting') {
        beat.subject_framing = beat.subject_framing || 'full_subject_contained';
        beat.framing_qc = beat.framing_qc || 'no_crop_contain_layout';
        beat.layout_style = beat.layout_style || 'left_text_right_saint';
      }
      synced++;
    }
  }
  return synced;
}

function main() {
  if (!fs.existsSync(scriptPath)) throw new Error(`Missing script: ${scriptPath}`);
  if (!fs.existsSync(planPath)) throw new Error(`Missing visual plan: ${planPath}`);
  const script = loadScript();
  const plan = readJson(planPath);
  const attribution = loadAttributionMap();
  const existing = new Set(plan.scenes.map(s => Number(s.scene_number)));
  let start = Math.max(0, ...plan.scenes.map(s => Number(s.start_s || 0) + Number(s.duration_s || 0)));
  let added = 0;
  for (const scene of script.scenes) {
    if (existing.has(Number(scene.scene_number))) continue;
    const next = makeScene(scene, start);
    plan.scenes.push(next);
    start += next.duration_s;
    added++;
  }
  const synced = overlayAttribution(plan, attribution);
  plan.scenes.sort((a, b) => Number(a.scene_number) - Number(b.scene_number));
  plan.total_beats = plan.scenes.reduce((sum, s) => sum + (s.beats ? s.beats.length : 0), 0);
  const MIN_DURATION_S = 480;
  let totalDuration = plan.scenes.reduce((sum, s) => sum + Number(s.duration_s || 0), 0);
  if (totalDuration < MIN_DURATION_S) {
    const deficit = MIN_DURATION_S - totalDuration;
    const lastScene = plan.scenes[plan.scenes.length - 1];
    const lastBeat = lastScene.beats[lastScene.beats.length - 1];
    lastBeat.duration_s += deficit;
    lastScene.duration_s += deficit;
    let bs = lastScene.start_s;
    for (const b of lastScene.beats) { b.start_s = bs; bs += b.duration_s; }
    totalDuration = MIN_DURATION_S;
    console.log(`⚠️  Padded total duration by ${deficit}s to meet ${MIN_DURATION_S}s minimum.`);
  }
  plan.estimated_total_duration_s = totalDuration;
  plan.generated_at = new Date().toISOString();
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
  console.log(`Synced visual plan for Saints ${id}: added ${added} scene(s), ${synced} beat attribution overlays, ${plan.total_beats} beats total.`);
}

main();
