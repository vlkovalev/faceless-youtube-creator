/** Saints-first PM report agent. */
'use strict';

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, SAINTS_ROOT } = require('./channel_paths');

const ROOT = SAINTS_ROOT;
const METADATA = path.join(ROOT, 'metadata');
const SHARED_METADATA = path.join(REPO_ROOT, 'metadata');
const EXISTING_DRAFT_IDS = [13, 14, 15, 16, 17, 18];
const NEXT_PRODUCTION_IDS = [21, 22, 23];

function readJson(rel, fallback) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function listFiles(rel, matcher = () => true) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(matcher);
}

function getSaintsQueue(queue) {
  return queue.filter(item =>
    String(item.channel || '').toLowerCase().includes('saints') ||
    String(item.filename || '').toUpperCase().startsWith('SAINTS_') ||
    String(item.script_id || '').startsWith('saints_')
  );
}

function inspectVideo(id) {
  const assets = `assets/saints_video_${id}_assets`;
  const visualPlan = readJson(`${assets}/visual_plan.json`, null);
  const qc = readJson(`metadata/qc_reports/saints_video_${id}_qc_report.json`, null);
  const failedChecks = qc && Array.isArray(qc.checks)
    ? qc.checks.filter(check => !check.ok).map(check => check.name)
    : [];
  const fileSourceCount =
    listFiles(`${assets}/real_sources`, n => /\.(jpg|jpeg|png|webp)$/i.test(n)).length ||
    listFiles(`${assets}/verified_sources`, n => /\.(jpg|jpeg|png|webp)$/i.test(n)).length;
  const beats = Array.isArray(visualPlan?.scenes)
    ? visualPlan.scenes.flatMap(scene => Array.isArray(scene?.beats) ? scene.beats : [])
    : [];
  const verifiedRealBeats = beats.filter(beat =>
    String(beat?.rights_status || '').toLowerCase() === 'verified' &&
    String(beat?.status || '').toLowerCase().includes('verified')
  );
  const uniqueVerifiedSources = new Set(
    verifiedRealBeats
      .map(beat => beat?.verified_source_key || beat?.primary_source_url || beat?.primary_source_label)
      .filter(Boolean)
  );
  const realSourceCount = uniqueVerifiedSources.size || fileSourceCount;
  return {
    id,
    script: exists(`scripts/saints_video_${id}_data.js`),
    plan: exists(`${assets}/visual_plan.json`),
    audio: listFiles(assets, n => /^scene_\d+_audio\.wav$/i.test(n)).length,
    sceneImages: listFiles(assets, n => /^scene_\d+_image\.(png|jpg|jpeg|svg)$/i.test(n)).length,
    beatImages: listFiles(assets, n => /^scene_\d+_beat_.+_image\.(png|jpg|jpeg)$/i.test(n)).length,
    realSources: realSourceCount,
    verifiedRealBeats: verifiedRealBeats.length,
    qcFailedChecks: failedChecks
  };
}

function main() {
  fs.mkdirSync(METADATA, { recursive: true });
  fs.mkdirSync(SHARED_METADATA, { recursive: true });
  const queue = readJson('metadata/queue.json', []);
  const status = readJson('metadata/youtube_channel_status_saints.json', { videos: [] });
  const rights = readJson('metadata/rights_verification_report.json', { summary: {} });
  const saintsQueue = getSaintsQueue(queue);
  const scriptIds = listFiles('scripts', n => /^saints_video_\d+_data\.js$/i.test(n))
    .map(n => Number((n.match(/(\d+)/) || [])[1]))
    .filter(Boolean);
  const queueIds = saintsQueue
    .map(q => Number(String(q.script_id || q.filename || '').match(/(\d+)/)?.[1]))
    .filter(Boolean);
  const ids = [...new Set([...scriptIds, ...queueIds, ...EXISTING_DRAFT_IDS, ...NEXT_PRODUCTION_IDS])].sort((a, b) => a - b);
  const videos = ids.map(inspectVideo);
  const channelVideos = Array.isArray(status.videos) ? status.videos : [];
  const privateDrafts = channelVideos.filter(v => String(v.privacy_status || v.status || '').toLowerCase() === 'private');
  const visualBlocked = videos.filter(v =>
    EXISTING_DRAFT_IDS.includes(Number(v.id)) &&
    v.plan &&
    (
      v.verifiedRealBeats === 0 ||
      v.qcFailedChecks.includes('saints_minimum_real_image_coverage') ||
      v.qcFailedChecks.includes('saints_real_image_coverage_per_scene') ||
      v.qcFailedChecks.includes('saints_minimum_one_icon_or_painting')
    )
  );
  const next = videos.find(v => NEXT_PRODUCTION_IDS.includes(Number(v.id)) && v.script && (!v.audio || v.beatImages < 20));

  const actions = [];
  if (visualBlocked.length) {
    actions.push({
      priority: 1,
      type: 'verified_visual_upgrade',
      action: `Review/add verified real visuals for Saints ${visualBlocked.map(v => v.id).join(', ')}: each needs at least one verified icon/portrait, monastery/location photo, manuscript/source image, and per-scene real-image coverage.`
    });
  }
  if (privateDrafts.length) {
    actions.push({
      priority: 2,
      type: 'youtube_review',
      action: `Review ${privateDrafts.length} Saints private draft(s) in YouTube Studio only after visual QC passes; do not publish while visual/rights gates fail.`
    });
  }
  if (rights.summary && Number(rights.summary.blocker || 0) > 0) {
    actions.push({
      priority: 3,
      type: 'akathist_permission_wait',
      action: 'Akathist/prayer companion videos remain parked until explicit reuse permission/license is recorded. Continue saint-life and Nikon/letters videos with paraphrase/original narration.'
    });
  }
  if (next) {
    actions.push({
      priority: 4,
      type: 'next_non_akathist_production',
      action: `Continue non-akathist Saints video ${next.id}: script=${next.script}, audio=${next.audio}, beatImages=${next.beatImages}.`
    });
  }
  actions.push({
    priority: 5,
    type: 'multi_channel_policy',
    action: 'All three channels stay active and isolated; do not delete, public-publish, spend, or use uncleared rights without approval.'
  });

  const report = {
    generated_at: new Date().toISOString(),
    mode: 'multi_channel_active_saints_visual_upgrade_priority',
    channel_status: {
      channel_id: status.channel?.id || status.channel_id || null,
      video_count: channelVideos.length
    },
    saints_queue_count: saintsQueue.length,
    rights_summary: rights.summary || {},
    videos,
    actions
  };
  const reportJson = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(METADATA, 'saints_pm_report.json'), reportJson);
  fs.writeFileSync(path.join(SHARED_METADATA, 'saints_pm_report.json'), reportJson);
  const md = [
    '# Saints PM Report',
    '',
    `Generated: ${report.generated_at}`,
    '',
    '## Priority Actions',
    ...actions.map(a => `- P${a.priority} ${a.type}: ${a.action}`),
    '',
    '## Video State',
    ...videos.map(v => `- Saints ${v.id}: script=${v.script} plan=${v.plan} audio=${v.audio} sceneImages=${v.sceneImages} beatImages=${v.beatImages} realSources=${v.realSources} verifiedRealBeats=${v.verifiedRealBeats} qcFailed=${v.qcFailedChecks.length ? v.qcFailedChecks.join(',') : 'none'}`)
  ].join('\n');
  fs.writeFileSync(path.join(METADATA, 'saints_pm_report.md'), md);
  fs.writeFileSync(path.join(SHARED_METADATA, 'saints_pm_report.md'), md);
  console.log(md);
}

main();
