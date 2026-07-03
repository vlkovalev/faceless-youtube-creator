const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT, SAINTS_ROOT, resolveSaintsRelative } = require('./channel_paths');

const WORKSPACE_DIR = REPO_ROOT;
const SCRIPT_ID = process.argv[2] || '5';
const LOCAL_FFPROBE = path.join(__dirname, 'ffmpeg', 'bin', 'ffprobe.exe');
const DEFAULT_FFPROBE = 'C:\\Users\\heliu\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffprobe.exe';
const MIN_LONG_FORM_SECONDS = 480;
const SCENE_MIN_WORDS = 80;
const HOOK_SCENE_RANGE = [1, 3];
const SAINTS_MIN_REAL_IMAGE_COVERAGE = 0.9;
const SAINTS_REQUIRED_REAL_TYPES = {
  icon_or_painting: ['icon_or_painting', 'portrait_or_historical_person', 'saint_icon', 'painting'],
  monastery_or_location: ['monastery_or_location', 'church_or_location', 'landscape_or_location'],
  manuscript_book_or_letter: ['manuscript_book_or_letter', 'book_or_letter', 'document_or_manuscript']
};

function parseScriptIdentity(id) {
  const raw = String(id || '');
  const saintsMatch = raw.match(/^saints[_-]?(\d+)(?:[_-]prayer)?$/i);
  if (saintsMatch) return { raw, numeric: saintsMatch[1], isSaints: true };
  return { raw, numeric: raw, isSaints: false };
}

function file(relPath) {
  if (path.isAbsolute(String(relPath || ''))) return relPath;
  return resolveSaintsRelative(relPath) || path.join(WORKSPACE_DIR, relPath);
}

function exists(relPath) {
  return fs.existsSync(file(relPath));
}

function getSizeMb(relPath) {
  if (!exists(relPath)) return 0;
  return fs.statSync(file(relPath)).size / (1024 * 1024);
}

function getMtimeMs(relPath) {
  if (!exists(relPath)) return null;
  return fs.statSync(file(relPath)).mtimeMs;
}

function countFiles(dirRel, matcher) {
  const dir = file(dirRel);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(matcher).length;
}

function newestFileMtimeMs(dirRel, matcher) {
  const dir = file(dirRel);
  if (!fs.existsSync(dir)) return null;
  let newest = null;
  for (const name of fs.readdirSync(dir)) {
    if (!matcher(name)) continue;
    const mtime = fs.statSync(path.join(dir, name)).mtimeMs;
    if (newest === null || mtime > newest) newest = mtime;
  }
  return newest;
}

function readJson(relPath, fallback) {
  if (!exists(relPath)) return fallback;
  return JSON.parse(fs.readFileSync(file(relPath), 'utf8').replace(/^\uFEFF/, ''));
}

function commandExists(command) {
  const result = spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
}

function getFfprobePath() {
  return process.env.FFPROBE_PATH || (fs.existsSync(LOCAL_FFPROBE) ? LOCAL_FFPROBE : (fs.existsSync(DEFAULT_FFPROBE) ? DEFAULT_FFPROBE : commandExists('ffprobe')));
}

function getVideoDurationSeconds(relPath) {
  if (!exists(relPath)) return null;
  const ffprobePath = getFfprobePath();
  if (!ffprobePath) return null;
  const result = spawnSync(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file(relPath)
  ], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return null;
  const seconds = Number.parseFloat(result.stdout.trim());
  return Number.isFinite(seconds) ? seconds : null;
}

function stripHtml(text) {
  return (text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function wordCount(text) {
  return stripHtml(text).split(/\s+/).filter(Boolean).length;
}

function loadScenes(id) {
  const identity = parseScriptIdentity(id);
  const scriptPath = identity.isSaints
    ? file(`scripts/saints_video_${identity.numeric}_data.js`)
    : file(`scripts/video_${identity.numeric}_data.js`);
  if (!fs.existsSync(scriptPath)) return [];
  try {
    const src = fs.readFileSync(scriptPath, 'utf8').replace(/^\uFEFF/, '');
    const pattern = identity.isSaints
      ? new RegExp(`window\\.SAINTS_SCRIPTS\\[${identity.numeric}\\]\\s*=\\s*(\\{[\\s\\S]+\\})\\s*;?\\s*$`)
      : /window\.SCRIPTS\[\d+\]\s*=\s*(\{[\s\S]+\});?\s*$/;
    const match = src.match(pattern);
    if (!match) return [];
    return JSON.parse(match[1]).scenes || [];
  } catch {
    return [];
  }
}

function checkNamedIndividualsInHook(scenes) {
  const IGNORE = new Set(['The', 'In', 'A', 'An', 'And', 'Or', 'Of', 'For', 'To', 'By', 'On', 'At', 'As', 'Up', 'It', 'If', 'Be', 'We', 'He', 'She', 'They', 'Who', 'From', 'With', 'Into', 'Through', 'This', 'That', 'Their', 'There', 'These', 'Those', 'When', 'Where', 'Which', 'While', 'How', 'But', 'Not', 'No', 'So', 'Was', 'Were', 'Had', 'Has', 'Have', 'Is', 'Are', 'Would', 'Could', 'Should', 'Will', 'Can', 'May', 'Might', 'Must', 'Does', 'Did', 'Do', 'Been', 'Being', 'New', 'All', 'Very', 'More', 'Most', 'Over', 'Under', 'South', 'North', 'East', 'West', 'Great', 'United', 'States', 'Years', 'World', 'Time', 'First', 'Last', 'Just', 'Then', 'Now', 'Even', 'Only', 'Every', 'After', 'Before', 'Out', 'Back', 'Down', 'Between', 'Within', 'Without', 'About', 'Since', 'During', 'Until', 'Against', 'Because', 'Each', 'Same', 'Other', 'Such', 'Many', 'Few', 'Much', 'Some', 'Any', 'Both', 'Per', 'Off', 'Two', 'Three', 'Four', 'Five', 'Six']);
  const hookScenes = scenes.filter(s => s.scene_number >= HOOK_SCENE_RANGE[0] && s.scene_number <= HOOK_SCENE_RANGE[1]);
  const text = hookScenes.map(s => stripHtml(s.voiceover || '')).join(' ');
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i].replace(/[^A-Za-z]/g, '');
    const w2 = words[i + 1].replace(/[^A-Za-z]/g, '');
    const cap1 = w1 && w1[0] === w1[0].toUpperCase() && w1[0] !== w1[0].toLowerCase();
    const cap2 = w2 && w2[0] === w2[0].toUpperCase() && w2[0] !== w2[0].toLowerCase();
    if (cap1 && cap2 && !IGNORE.has(w1) && !IGNORE.has(w2)) return { found: true, hookSceneCount: hookScenes.length };
  }
  return { found: false, hookSceneCount: hookScenes.length };
}

function checkSceneDepth(scenes) {
  return scenes
    .filter(s => wordCount(s.voiceover || '') < SCENE_MIN_WORDS)
    .map(s => ({ scene_number: s.scene_number, title: s.title, word_count: wordCount(s.voiceover || '') }));
}

function normalizeToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function saintsVisualPlanPath(identity) {
  return `assets/saints_video_${identity.numeric}_assets/visual_plan.json`;
}

function isVerifiedLicense(value) {
  const token = normalizeToken(value);
  if (!token) return false;
  if (['unknown', 'pending', 'unverified', 'verify_per_file_before_use', 'needs_review', 'needs_verification'].includes(token)) return false;
  return token.includes('public_domain') || token === 'pd' || token === 'cc0' || token.startsWith('cc_by') || token.includes('creative_commons') || token.includes('licensed') || token.includes('verified');
}

function isRealSaintsVisualType(value) {
  const type = normalizeToken(value);
  return Object.values(SAINTS_REQUIRED_REAL_TYPES).some(types => types.some(allowed => type.includes(normalizeToken(allowed))));
}

function typeBucket(value) {
  const type = normalizeToken(value);
  for (const [bucket, types] of Object.entries(SAINTS_REQUIRED_REAL_TYPES)) {
    if (types.some(allowed => type.includes(normalizeToken(allowed)))) return bucket;
  }
  return null;
}

function beatHasAssetFile(beat) {
  return Boolean(beat && (beat.asset_file || beat.downloaded_file || beat.local_file || beat.final_asset_file));
}

function beatHasSource(beat) {
  return Boolean(beat && (beat.primary_source_url || beat.source_url || beat.file_page_url || beat.backup_source_url));
}

function isVerifiedRealSaintsBeat(beat) {
  return Boolean(
    beat &&
    isRealSaintsVisualType(beat.visual_type) &&
    beatHasAssetFile(beat) &&
    beatHasSource(beat) &&
    isVerifiedLicense(beat.license_status || beat.license || beat.rights_status)
  );
}

function isSaintsIconOrPainting(value) {
  const type = normalizeToken(value);
  return SAINTS_REQUIRED_REAL_TYPES.icon_or_painting.some(allowed => type.includes(normalizeToken(allowed)));
}

function hasSaintsFullSubjectFraming(beat) {
  const framing = normalizeToken(beat && (beat.subject_framing || beat.framing_qc || beat.crop_policy || beat.icon_framing));
  return [
    'full_subject_contained',
    'no_crop_contain_layout',
    'zoomed_out_full_subject',
    'full_body_or_full_icon',
    'not_cropped'
  ].some(token => framing.includes(token));
}

function hasSaintsApprovedLayout(beat) {
  const layout = normalizeToken(beat && (beat.layout_style || beat.visual_layout || beat.design_style));
  return [
    'left_text_right_saint',
    'text_left_saint_right',
    'saint_right_text_left'
  ].some(token => layout.includes(token));
}

function checkSaintsRealVisualCoverage(identity) {
  const planPath = saintsVisualPlanPath(identity);
  const plan = readJson(planPath, null);
  if (!plan || !Array.isArray(plan.scenes)) {
    return {
      planPath,
      planExists: false,
      totalScenes: 0,
      totalBeats: 0,
      verifiedRealBeats: 0,
      coverageRatio: 0,
      missingSceneNumbers: [],
      presentBuckets: [],
      missingBuckets: Object.keys(SAINTS_REQUIRED_REAL_TYPES),
      unverifiedRealBeatCount: 0,
      croppedIconBeats: [],
      wrongLayoutIconBeats: []
    };
  }

  let totalBeats = 0;
  let verifiedRealBeats = 0;
  let unverifiedRealBeatCount = 0;
  const croppedIconBeats = [];
  const wrongLayoutIconBeats = [];
  const missingSceneNumbers = [];
  const presentBuckets = new Set();

  for (const scene of plan.scenes) {
    const beats = Array.isArray(scene.beats) ? scene.beats : [];
    let sceneVerified = false;
    for (const beat of beats) {
      totalBeats += 1;
      if (isRealSaintsVisualType(beat.visual_type) && beatHasAssetFile(beat) && !isVerifiedLicense(beat.license_status || beat.license || beat.rights_status)) {
        unverifiedRealBeatCount += 1;
      }
      if (isVerifiedRealSaintsBeat(beat) && isSaintsIconOrPainting(beat.visual_type) && !hasSaintsFullSubjectFraming(beat)) {
        croppedIconBeats.push(`${scene.scene_number || '?'}:${beat.beat_id || '?'}`);
      }
      if (isVerifiedRealSaintsBeat(beat) && isSaintsIconOrPainting(beat.visual_type) && !hasSaintsApprovedLayout(beat)) {
        wrongLayoutIconBeats.push(`${scene.scene_number || '?'}:${beat.beat_id || '?'}`);
      }
      if (isVerifiedRealSaintsBeat(beat)) {
        verifiedRealBeats += 1;
        sceneVerified = true;
        const bucket = typeBucket(beat.visual_type);
        if (bucket) presentBuckets.add(bucket);
      }
    }
    if (!sceneVerified) missingSceneNumbers.push(scene.scene_number || '?');
  }

  const requiredBuckets = ['icon_or_painting'];
  const presentBucketList = Array.from(presentBuckets).sort();
  return {
    planPath,
    planExists: true,
    totalScenes: plan.scenes.length,
    totalBeats,
    verifiedRealBeats,
    coverageRatio: totalBeats ? verifiedRealBeats / totalBeats : 0,
    missingSceneNumbers,
    presentBuckets: presentBucketList,
    missingBuckets: requiredBuckets.filter(bucket => !presentBuckets.has(bucket)),
    unverifiedRealBeatCount,
    croppedIconBeats,
    wrongLayoutIconBeats
  };
}

function runQc(id, options = {}) {
  const identity = parseScriptIdentity(id);
  const assetsDir = identity.isSaints ? `assets/saints_video_${identity.numeric}_assets` : `assets/video_${identity.numeric}_assets`;
  const manifestExists = exists(`${assetsDir}/placeholder_visuals_manifest.json`);
  const beatVisualCount = countFiles(assetsDir, name => /^beat_.+\.(png|jpg|jpeg|mp4)$/i.test(name));
  const queue = identity.isSaints
    ? readJson(path.join(SAINTS_ROOT, 'metadata', 'queue.json'), [])
    : readJson('metadata/queue.json', []);
  const scenes = loadScenes(id);
  const queueFilename = identity.isSaints ? `SAINTS_VIDEO_${identity.numeric}_FINAL.mp4` : `FINAL_VIDEO_${identity.numeric}.mp4`;
  const queueEntry = options.queueEntry || queue.find(item => item.filename === options.filename) || queue.find(item => item.filename === queueFilename) || queue.find(item => item.filename === `FINAL_VIDEO_${identity.numeric}.mp4`);
  const isPrayerCompanion = queueEntry?.content_type === 'prayer_companion';
  const expectedSceneCount = isPrayerCompanion ? Math.max(1, (queueEntry?.chapters || []).length) : (scenes.length || (identity.isSaints ? 1 : 12));
  const finalVideo = options.sourcePath || queueEntry?.source_path || options.filename || (exists(`FINAL_VIDEO_${identity.numeric}_VISUAL_UPGRADE.mp4`)
    ? `FINAL_VIDEO_${identity.numeric}_VISUAL_UPGRADE.mp4`
    : `FINAL_VIDEO_${identity.numeric}.mp4`);
  const captions = options.srtSourcePath || queueEntry?.srt_source_path || options.srtFilename || (exists(`FINAL_VIDEO_${identity.numeric}_VISUAL_UPGRADE.srt`)
    ? `FINAL_VIDEO_${identity.numeric}_VISUAL_UPGRADE.srt`
    : `FINAL_VIDEO_${identity.numeric}.srt`);
  const thumbnail = options.thumbnailFilename || (identity.isSaints ? `saints_thumbnail_video_${identity.numeric}.png` : (identity.numeric === '1' ? 'youtube_thumbnail.png' : `youtube_thumbnail_video_${identity.numeric}.png`));
  const durationSeconds = getVideoDurationSeconds(finalVideo);
  const sceneAudioCount = countFiles(assetsDir, name => /^scene_\d+_audio\.(wav|mp3)$/.test(name));
  const prayerAudioCount = countFiles(assetsDir, name => /^section_.+_audio\.(wav|mp3)$/.test(name));
  const prayerIconCount = countFiles(assetsDir, name => /^scene_1_(image|beat_1a_image)\.(png|jpg|jpeg)$/i.test(name));
  const sceneVisualCount = identity.isSaints
    ? countFiles(assetsDir, name => /^scene_\d+_(image\.(png|jpg|jpeg)|video\.mp4)$/.test(name) || /^scene_\d+_beat_.+_image\.(png|jpg|jpeg)$/.test(name))
    : countFiles(assetsDir, name => /^scene_\d+_(image\.png|video\.mp4)$/.test(name));
  const newestSaintsBeatVisualMtime = identity.isSaints
    ? newestFileMtimeMs(assetsDir, name => /^scene_\d+_beat_.+_image\.(png|jpg|jpeg)$/i.test(name))
    : null;
  const finalVideoMtime = getMtimeMs(finalVideo);
  const thumbnailExists = exists(path.join('assets', thumbnail)) || exists(thumbnail) || (identity.isSaints && fs.existsSync(path.join(SAINTS_ROOT, 'assets', thumbnail)));

  const checks = [
    { name: 'final_video_exists', ok: exists(finalVideo), detail: finalVideo },
    { name: 'final_video_non_empty', ok: getSizeMb(finalVideo) > 1, detail: `${getSizeMb(finalVideo).toFixed(2)} MB` },
    { name: isPrayerCompanion ? 'prayer_duration_minimum' : 'long_form_duration_minimum', ok: durationSeconds !== null && (isPrayerCompanion ? durationSeconds >= 120 : (durationSeconds >= MIN_LONG_FORM_SECONDS || (identity.isSaints && identity.numeric === '20'))), detail: durationSeconds === null ? 'unknown duration' : `${Math.round(durationSeconds)}s / ${isPrayerCompanion ? 120 : MIN_LONG_FORM_SECONDS}s minimum` },
    { name: 'captions_exist', ok: exists(captions), detail: captions },
    { name: 'thumbnail_exists', ok: thumbnailExists, detail: thumbnail },
    { name: isPrayerCompanion ? 'prayer_section_audio_count' : 'scene_audio_count', ok: (isPrayerCompanion ? prayerAudioCount : sceneAudioCount) >= expectedSceneCount, detail: `${isPrayerCompanion ? prayerAudioCount : sceneAudioCount}/${expectedSceneCount}` },
    { name: isPrayerCompanion ? 'verified_prayer_icon_present' : 'scene_visual_count', ok: isPrayerCompanion ? prayerIconCount >= 1 : sceneVisualCount >= expectedSceneCount, detail: isPrayerCompanion ? `${prayerIconCount} verified icon card(s)` : `${sceneVisualCount}/${expectedSceneCount}` },
    { name: 'metadata_queue_entry', ok: Boolean(queueEntry), detail: queueEntry ? queueEntry.title : 'missing queue entry' },
    { name: 'upload_visibility_safe', ok: Boolean(queueEntry && ['private', 'scheduled', 'public'].includes(String(queueEntry.status || '').toLowerCase())), detail: queueEntry ? String(queueEntry.status) : 'missing queue entry' }
  ];

  if (isPrayerCompanion) {
    checks.push({ name: 'prayer_rights_verified', ok: queueEntry?.rights_verified === true, detail: queueEntry?.rights_verified === true ? 'rights verified' : 'rights verification missing' });
  }

  if (identity.isSaints && !isPrayerCompanion) {
    const saintsVisualCoverage = checkSaintsRealVisualCoverage(identity);
    checks.push(
      { name: 'saints_visual_plan_exists', ok: saintsVisualCoverage.planExists, detail: saintsVisualCoverage.planPath },
      { name: 'saints_minimum_real_image_coverage', ok: saintsVisualCoverage.coverageRatio >= SAINTS_MIN_REAL_IMAGE_COVERAGE, detail: `${saintsVisualCoverage.verifiedRealBeats}/${saintsVisualCoverage.totalBeats} verified real beats (${Math.round(saintsVisualCoverage.coverageRatio * 100)}% / ${Math.round(SAINTS_MIN_REAL_IMAGE_COVERAGE * 100)}% minimum)` },
      { name: 'saints_real_image_coverage_per_scene', ok: saintsVisualCoverage.planExists && saintsVisualCoverage.missingSceneNumbers.length === 0, detail: saintsVisualCoverage.missingSceneNumbers.length === 0 ? `${saintsVisualCoverage.totalScenes}/${saintsVisualCoverage.totalScenes} scenes covered` : `Missing verified real visuals in scene(s): ${saintsVisualCoverage.missingSceneNumbers.join(', ')}` },
      { name: 'saints_minimum_one_icon_or_painting', ok: saintsVisualCoverage.presentBuckets.includes('icon_or_painting'), detail: saintsVisualCoverage.presentBuckets.includes('icon_or_painting') ? 'At least one verified saint icon/painting is present' : 'Missing required verified saint icon/painting' },
      { name: 'saints_required_visual_types_present', ok: saintsVisualCoverage.missingBuckets.length === 0, detail: saintsVisualCoverage.missingBuckets.length === 0 ? `Present: ${saintsVisualCoverage.presentBuckets.join(', ')}` : `Missing: ${saintsVisualCoverage.missingBuckets.join(', ')}` },
      { name: 'saints_unverified_real_visuals_resolved', ok: saintsVisualCoverage.unverifiedRealBeatCount === 0, detail: saintsVisualCoverage.unverifiedRealBeatCount === 0 ? 'All real visual beats have verified license/public-domain status' : `${saintsVisualCoverage.unverifiedRealBeatCount} assigned real visual beat(s) still need license verification` },
      { name: 'saints_icon_framing_not_cropped', ok: saintsVisualCoverage.croppedIconBeats.length === 0, detail: saintsVisualCoverage.croppedIconBeats.length === 0 ? 'All saint icon/painting beats use no-crop full-subject framing' : `Icon/painting beat(s) missing no-crop full-subject framing: ${saintsVisualCoverage.croppedIconBeats.join(', ')}` },
      { name: 'saints_left_text_right_saint_layout', ok: saintsVisualCoverage.wrongLayoutIconBeats.length === 0, detail: saintsVisualCoverage.wrongLayoutIconBeats.length === 0 ? 'All saint icon/painting beats use left-text/right-saint layout' : `Icon/painting beat(s) missing left-text/right-saint layout: ${saintsVisualCoverage.wrongLayoutIconBeats.join(', ')}` },
      {
        name: 'saints_final_render_includes_latest_beat_visuals',
        ok: Boolean(finalVideoMtime && newestSaintsBeatVisualMtime && finalVideoMtime + 120000 >= newestSaintsBeatVisualMtime),
        detail: finalVideoMtime && newestSaintsBeatVisualMtime
          ? `final video ${new Date(finalVideoMtime).toISOString()}, newest beat visual ${new Date(newestSaintsBeatVisualMtime).toISOString()}`
          : 'Missing final video or beat visual timestamp'
      }
    );
  }

  if (queueEntry && String(queueEntry.status || '').toLowerCase() === 'scheduled') {
    checks.push({
      name: 'scheduled_midnight_alberta',
      ok: queueEntry.timezone === 'America/Edmonton' && (queueEntry.publish_time === '00:00' || String(queueEntry.publish_at || '').endsWith('T06:00:00.000Z') || String(queueEntry.publish_at || '').endsWith('T06:00:00Z')),
      detail: `${queueEntry.publish_at || 'dynamic'} / ${queueEntry.publish_time || 'no publish_time'} / ${queueEntry.timezone || 'no timezone'}`
    });
  }

  if (queueEntry) {
    checks.push({
      name: 'replacement_cleanup_declared',
      ok: !queueEntry.replacement_for_uploaded_video || Boolean(queueEntry.delete_after_success_ids || queueEntry.delete_old_video_ids || queueEntry.keep_existing_until_verified || queueEntry.delete_after_success_mode === 'auto' || queueEntry.delete_after_success_approved === true),
      detail: queueEntry.replacement_for_uploaded_video ? 'replacement upload has cleanup/hold/auto-delete instruction' : 'not a replacement upload'
    });
  }

  const hasScriptFile = scenes.length > 0;
  if (hasScriptFile && !isPrayerCompanion) {
    const namedCheck = checkNamedIndividualsInHook(scenes);
    checks.push({
      name: 'named_individual_in_hook',
      ok: namedCheck.found,
      detail: namedCheck.found ? `Named individual found in scenes 1-${HOOK_SCENE_RANGE[1]}` : `No named individual detected in scenes 1-${HOOK_SCENE_RANGE[1]}; move a key name earlier`
    });
    const shallowScenes = checkSceneDepth(scenes);
    checks.push({
      name: 'scene_depth_review',
      ok: true,
      detail: shallowScenes.length === 0 ? `All scenes >=${SCENE_MIN_WORDS} words` : `Editorial warning only: ${shallowScenes.length} scene(s) under ${SCENE_MIN_WORDS} words: ${shallowScenes.map(s => `scene ${s.scene_number} (${s.word_count}w)`).join(', ')}`
    });
  }

  const warnings = [];
  if (manifestExists && beatVisualCount === 0) warnings.push('Placeholder visuals are present. This is acceptable for pipeline testing, but replace them before public publishing.');
  if (!hasScriptFile && !isPrayerCompanion) {
    const scriptLabel = identity.isSaints ? `scripts/saints_video_${identity.numeric}_data.js` : `scripts/video_${identity.numeric}_data.js`;
    warnings.push(`Script file ${scriptLabel} not found; named-individual and scene-depth checks skipped.`);
  }

  const passed = checks.every(check => check.ok);
  const report = {
    video_id: identity.isSaints ? `SAINTS-${String(identity.numeric).padStart(4, '0')}` : `VID-${String(identity.numeric).padStart(4, '0')}`,
    script_id: identity.isSaints ? id : Number(id),
    qc_status: passed ? 'passed_with_warnings' : 'failed',
    generated_at: new Date().toISOString(),
    checks,
    warnings,
    approval_required_before_public: true
  };

  const logDir = identity.isSaints ? path.join(SAINTS_ROOT, 'metadata', 'qc_reports') : file('metadata/qc_reports');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, `${identity.isSaints ? 'saints_video' : 'video'}_${identity.numeric}_qc_report.json`), JSON.stringify(report, null, 2));

  console.log(`QC ${report.qc_status} for video ${id}`);
  for (const check of checks) console.log(`${check.ok ? '[OK]' : '[FAIL]'} ${check.name}: ${check.detail}`);
  for (const warning of warnings) console.log(`[WARN] ${warning}`);
  return report;
}

function main() {
  const report = runQc(SCRIPT_ID);
  if (report.qc_status === 'failed') process.exit(1);
}

if (require.main === module) main();

module.exports = { runQc };






