/**
 * visual_plan_densifier.js
 *
 * Preserves an existing visual_plan.json but splits long beats into shorter
 * cuts so the editor uses more images. Existing downloaded assets remain on
 * the first split beat; added beats are marked as needing alternate images and
 * fall back to the original asset until better images are sourced.
 *
 * Usage:
 *   node automation/visual_plan_densifier.js --video 1
 *   node automation/visual_plan_densifier.js --video 1,2,3 --max 10
 *   node automation/visual_plan_densifier.js --all --max 10
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'assets');
const DEFAULT_MAX_BEAT_SECONDS = 10;
const MIN_SPLIT_SECONDS = 4;

function loadPlan(videoId) {
  const planPath = path.join(ASSETS_DIR, `video_${videoId}_assets`, 'visual_plan.json');
  if (!fs.existsSync(planPath)) throw new Error(`Missing plan: ${planPath}`);
  return {
    planPath,
    plan: JSON.parse(fs.readFileSync(planPath, 'utf8').replace(/^\uFEFF/, '')),
  };
}

function splitNarration(text, parts) {
  const clean = String(text || '').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  if (sentences.length >= parts) {
    const chunkSize = Math.ceil(sentences.length / parts);
    const chunks = [];
    for (let i = 0; i < sentences.length; i += chunkSize) {
      chunks.push(sentences.slice(i, i + chunkSize).join(' ').trim());
    }
    return chunks.slice(0, parts);
  }

  const words = clean.split(/\s+/).filter(Boolean);
  const chunkSize = Math.ceil(words.length / parts);
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }
  while (chunks.length < parts) chunks.push(clean);
  return chunks.slice(0, parts);
}

function makeAltQuery(originalBeat, index) {
  const base = String(originalBeat.search_query || '').replace(/^\[GENERATE\]\s*/i, '').trim();
  const hints = [
    'archival photo close-up',
    'document newspaper evidence',
    'period location exterior',
    'portrait or product detail',
  ];
  return `${base} ${hints[(index - 1) % hints.length]}`.trim();
}

function splitBeat(beat, maxSeconds) {
  const duration = Number(beat.duration_s || beat.dur || 0);
  if (duration <= maxSeconds) return [beat];

  const parts = Math.max(2, Math.ceil(duration / maxSeconds));
  const narrationParts = splitNarration(beat.narration_excerpt, parts);
  const baseDuration = Math.floor(duration / parts);
  let remainder = duration - baseDuration * parts;
  let start = Number(beat.start_s || 0);
  const originalFallback = beat.asset_file || beat.fallback || null;

  return Array.from({ length: parts }, function(_, index) {
    const isFirst = index === 0;
    const nextDuration = Math.max(MIN_SPLIT_SECONDS, baseDuration + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;

    const cloned = {
      ...beat,
      beat_id: isFirst ? beat.beat_id : `${beat.beat_id}_${index + 1}`,
      start_s: start,
      duration_s: nextDuration,
      narration_excerpt: narrationParts[index] || beat.narration_excerpt,
      densified_from: beat.beat_id,
      original_duration_s: duration,
      density_status: isFirst ? 'original_asset_preserved' : 'alternate_image_needed',
    };

    if (!isFirst) {
      cloned.asset_file = null;
      cloned.status = 'pending_alt_image';
      cloned.needs_new_image = true;
      cloned.fallback = originalFallback;
      cloned.suggested_asset_file = `assets/video_${cloned.video_id}_assets/beat_${cloned.beat_id}.jpg`;
      cloned.search_query = makeAltQuery(beat, index);
      cloned.asset_note = `${beat.asset_note || 'alternate visual'}; source a different image to avoid a long static hold`;
    }

    start += nextDuration;
    return cloned;
  });
}

function densifyPlan(videoId, plan, maxSeconds) {
  let added = 0;
  let split = 0;
  let maxAfter = 0;

  plan.scenes.forEach(function(scene) {
    const newBeats = [];
    (scene.beats || []).forEach(function(beat) {
      beat.video_id = videoId;
      const pieces = splitBeat(beat, maxSeconds);
      if (pieces.length > 1) {
        split++;
        added += pieces.length - 1;
      }
      pieces.forEach(function(piece) {
        maxAfter = Math.max(maxAfter, Number(piece.duration_s || 0));
        delete piece.video_id;
        newBeats.push(piece);
      });
    });

    scene.beats = newBeats;
    scene.beat_count = newBeats.length;
  });

  plan.total_beats = plan.scenes.reduce(function(total, scene) {
    return total + (scene.beats || []).length;
  }, 0);
  plan.density_profile = {
    max_target_beat_seconds: maxSeconds,
    added_beats: added,
    split_original_beats: split,
    max_beat_after_s: maxAfter,
    generated_at: new Date().toISOString(),
    note: 'Extra beats marked pending_alt_image should receive distinct source images before final upload.',
  };

  return { added, split, maxAfter };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const maxIdx = args.indexOf('--max');
  const max = maxIdx !== -1 && args[maxIdx + 1] ? Number(args[maxIdx + 1]) : DEFAULT_MAX_BEAT_SECONDS;

  if (args.includes('--all')) return { ids: [1, 2, 3, 4, 5], max };

  const videoIdx = args.indexOf('--video');
  if (videoIdx !== -1 && args[videoIdx + 1]) {
    return {
      ids: args[videoIdx + 1].split(',').map(Number).filter(Boolean),
      max,
    };
  }

  const inline = args.find(arg => arg.startsWith('--video='));
  if (inline) {
    return {
      ids: inline.replace('--video=', '').split(',').map(Number).filter(Boolean),
      max,
    };
  }

  return { ids: [1], max };
}

function main() {
  const { ids, max } = parseArgs();
  console.log(`\nVisual Plan Densifier — max ${max}s per beat`);

  ids.forEach(function(videoId) {
    const { planPath, plan } = loadPlan(videoId);
    const before = plan.total_beats || plan.scenes.reduce((total, scene) => total + (scene.beats || []).length, 0);
    const result = densifyPlan(videoId, plan, max);
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
    console.log(`Video ${videoId}: ${before} -> ${plan.total_beats} beats (+${result.added}); split ${result.split}; max now ${result.maxAfter}s`);
  });

  console.log('\nNext: source files marked status=pending_alt_image, then rerender with editor_beat_agent.js.');
}

main();
