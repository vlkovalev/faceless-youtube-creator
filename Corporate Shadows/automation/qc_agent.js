const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { REPO_ROOT, SAINTS_ROOT, resolveSaintsRelative } = require('./channel_paths');

const WORKSPACE_DIR = REPO_ROOT;
const SCRIPT_ID = process.argv[2] || '5';
const LOCAL_FFPROBE = path.join(__dirname, 'ffmpeg', 'bin', 'ffprobe.exe');
const DEFAULT_FFPROBE = 'C:\\Users\\heliu\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffprobe.exe';
const MIN_LONG_FORM_SECONDS = 480;
const SCENE_MIN_WORDS = 80;
const HOOK_SCENE_RANGE = [1, 3];

function parseScriptIdentity(id) {
  const raw = String(id || '');
  const saintsMatch = raw.match(/^saints[_-]?(\d+)$/i);
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

function firstExisting(paths) {
  for (const candidate of paths) {
    if (candidate && exists(candidate)) return candidate;
  }
  return paths.find(Boolean) || null;
}

function getSizeMb(relPath) {
  if (!exists(relPath)) return 0;
  return fs.statSync(file(relPath)).size / (1024 * 1024);
}

function countFiles(dirRel, matcher) {
  const dir = file(dirRel);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(matcher).length;
}

function isSceneAudioAsset(name) {
  return /^scene_\d+_audio\.(wav|mp3)$/i.test(name);
}

function readJson(relPath, fallback) {
  if (!exists(relPath)) return fallback;
  return JSON.parse(fs.readFileSync(file(relPath), 'utf8').replace(/^\uFEFF/, ''));
}

function fileHash(relPath) {
  const abs = file(relPath);
  if (!fs.existsSync(abs)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

function countSceneImagesCopiedFromBeatCards(assetsDir, expectedSceneCount) {
  const absDir = file(assetsDir);
  if (!fs.existsSync(absDir)) return 0;
  let copied = 0;
  for (let i = 1; i <= expectedSceneCount; i++) {
    const sceneHash = fileHash(`${assetsDir}/scene_${i}_image.png`);
    if (!sceneHash) continue;
    const beatFiles = fs.readdirSync(absDir)
      .filter(name => new RegExp(`^beat_${i}[a-z].+\\.(png|jpg|jpeg)$`, 'i').test(name));
    if (beatFiles.some(name => fileHash(`${assetsDir}/${name}`) === sceneHash)) copied++;
  }
  return copied;
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

function runQc(id, options = {}) {
  const identity = parseScriptIdentity(id);
  const assetsDir = identity.isSaints ? `assets/saints_video_${identity.numeric}_assets` : `assets/video_${identity.numeric}_assets`;
  const manifestExists = exists(`${assetsDir}/placeholder_visuals_manifest.json`);
  const qualityManifest = readJson(`${assetsDir}/visual_quality_manifest.json`, null);
  const beatVisualCount = countFiles(assetsDir, name => /^beat_.+\.(png|jpg|jpeg|mp4)$/i.test(name));
  const upgradedSceneVideoCount = countFiles(assetsDir, name => /^scene_\d+_video\.mp4$/i.test(name));
  const queue = readJson('metadata/queue.json', []);
  const scenes = loadScenes(id);
  const expectedSceneCount = scenes.length || (identity.isSaints ? 1 : 12);
  const baseVideoNames = [
    options.sourcePath,
    options.filename,
    `videos/uploaded/FINAL_VIDEO_${identity.numeric}_VISUAL_UPGRADE.mp4`,
    `videos/uploaded/FINAL_VIDEO_${identity.numeric}.mp4`,
    `omni_videos/FINAL_VIDEO_${identity.numeric}_OMNI_FLASH.mp4`,
    `FINAL_VIDEO_${identity.numeric}_VISUAL_UPGRADE.mp4`,
    `FINAL_VIDEO_${identity.numeric}.mp4`
  ].filter(Boolean);
  const baseCaptionNames = [
    options.srtSourcePath,
    options.srtFilename,
    `videos/uploaded/FINAL_VIDEO_${identity.numeric}_VISUAL_UPGRADE.srt`,
    `videos/uploaded/FINAL_VIDEO_${identity.numeric}.srt`,
    `omni_videos/FINAL_VIDEO_${identity.numeric}_OMNI_FLASH.srt`,
    `FINAL_VIDEO_${identity.numeric}_VISUAL_UPGRADE.srt`,
    `FINAL_VIDEO_${identity.numeric}.srt`
  ].filter(Boolean);
  let finalVideo = firstExisting(baseVideoNames);
  let captions = firstExisting(baseCaptionNames);
  const thumbnail = options.thumbnailFilename || (identity.isSaints ? `saints_thumbnail_video_${identity.numeric}.png` : (identity.numeric === '1' ? 'youtube_thumbnail.png' : `youtube_thumbnail_video_${identity.numeric}.png`));
  const queueCandidates = queue.filter(item => {
    const filename = String(item.filename || '');
    return filename === options.filename ||
      filename === path.basename(String(finalVideo || '')) ||
      filename === `FINAL_VIDEO_${identity.numeric}.mp4` ||
      filename === `FINAL_VIDEO_${identity.numeric}_VISUAL_UPGRADE.mp4` ||
      filename === `FINAL_VIDEO_${identity.numeric}_OMNI_FLASH.mp4`;
  });
  const queueEntry = options.queueEntry || queueCandidates.sort((a, b) => {
    const score = item => {
      const filename = String(item.filename || '');
      return (item.source_path ? 4 : 0) +
        (filename.includes('_OMNI_FLASH') ? 3 : 0) +
        (filename.includes('_VISUAL_UPGRADE') ? 2 : 0) +
        (item.publish_at ? 1 : 0);
    };
    return score(b) - score(a);
  })[0];
  if (!options.sourcePath && queueEntry && queueEntry.source_path) finalVideo = firstExisting([queueEntry.source_path, finalVideo]);
  if (!options.srtSourcePath && queueEntry && queueEntry.srt_source_path) captions = firstExisting([queueEntry.srt_source_path, captions]);
  const durationSeconds = getVideoDurationSeconds(finalVideo);
  const sceneAudioCount = countFiles(assetsDir, isSceneAudioAsset);
  const sceneVisualCount = identity.isSaints
    ? countFiles(assetsDir, name => /^scene_\d+_(image\.(png|jpg|jpeg)|video\.mp4)$/.test(name) || /^scene_\d+_beat_.+_image\.(png|jpg|jpeg)$/.test(name))
    : countFiles(assetsDir, name => /^scene_\d+_(image\.png|video\.mp4)$/.test(name) || /^beat_\d+[a-z]_real\.(jpg|jpeg|png)$/.test(name));
  const copiedBeatCardSceneCount = identity.isSaints ? 0 : countSceneImagesCopiedFromBeatCards(assetsDir, expectedSceneCount);

  const checks = [
    { name: 'final_video_exists', ok: exists(finalVideo), detail: finalVideo },
    { name: 'final_video_non_empty', ok: getSizeMb(finalVideo) > 1, detail: `${getSizeMb(finalVideo).toFixed(2)} MB` },
    { name: 'long_form_duration_minimum', ok: durationSeconds !== null && durationSeconds >= MIN_LONG_FORM_SECONDS, detail: durationSeconds === null ? 'unknown duration' : `${Math.round(durationSeconds)}s / ${MIN_LONG_FORM_SECONDS}s minimum` },
    { name: 'captions_exist', ok: exists(captions), detail: captions },
    { name: 'thumbnail_exists', ok: exists(path.join('assets', thumbnail)) || exists(thumbnail) || (identity.isSaints && fs.existsSync(path.join(SAINTS_ROOT, 'assets', thumbnail))), detail: thumbnail },
    { name: 'scene_audio_count', ok: sceneAudioCount >= expectedSceneCount, detail: `${sceneAudioCount}/${expectedSceneCount}` },
    { name: 'scene_visual_count', ok: sceneVisualCount >= expectedSceneCount, detail: `${sceneVisualCount}/${expectedSceneCount}` },
    { name: 'scene_visuals_not_raw_beat_cards', ok: copiedBeatCardSceneCount === 0, detail: copiedBeatCardSceneCount === 0 ? 'scene images are distinct final plates' : `${copiedBeatCardSceneCount} scene image(s) are raw copied beat cards` },
    { name: 'metadata_queue_entry', ok: Boolean(queueEntry), detail: queueEntry ? queueEntry.title : 'missing queue entry' },
    { name: 'upload_visibility_safe', ok: Boolean(queueEntry && ['private', 'scheduled', 'public'].includes(String(queueEntry.status || '').toLowerCase())), detail: queueEntry ? String(queueEntry.status) : 'missing queue entry' }
  ];

  if (!identity.isSaints && String(identity.numeric) === '10') {
    checks.push({
      name: 'video_10_visual_quality_manifest',
      ok: Boolean(qualityManifest && qualityManifest.style === 'cinematic_documentary_scene_plates'),
      detail: qualityManifest ? String(qualityManifest.style || 'manifest missing style') : 'missing visual_quality_manifest.json'
    });
  }

  if (queueEntry && String(queueEntry.status || '').toLowerCase() === 'scheduled') {
    checks.push({
      name: 'scheduled_midnight_alberta',
      ok: String(queueEntry.publish_at || '').endsWith('T06:00:00.000Z') ||
        String(queueEntry.publish_at || '').endsWith('T06:00:00Z') ||
        (queueEntry.timezone === 'America/Edmonton' && queueEntry.publish_time === '00:00'),
      detail: `${queueEntry.publish_at || 'dynamic'} / ${queueEntry.publish_time || 'no publish_time'} / ${queueEntry.timezone || 'no timezone'}`
    });
  }

  if (queueEntry) {
    checks.push({
      name: 'replacement_cleanup_declared',
      ok: !queueEntry.replacement_for_uploaded_video || Boolean(queueEntry.delete_after_success_ids || queueEntry.delete_old_video_ids || queueEntry.keep_existing_until_verified),
      detail: queueEntry.replacement_for_uploaded_video ? 'replacement upload has cleanup/hold instruction' : 'not a replacement upload'
    });
  }

  const hasScriptFile = scenes.length > 0;
  if (hasScriptFile) {
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
  if (manifestExists && beatVisualCount === 0 && upgradedSceneVideoCount === 0) warnings.push('Placeholder visuals are present. This is acceptable for pipeline testing, but replace them before public publishing.');
  if (!hasScriptFile) {
    const scriptLabel = identity.isSaints ? `scripts/saints_video_${identity.numeric}_data.js` : `scripts/video_${identity.numeric}_data.js`;
    warnings.push(`Script file ${scriptLabel} not found; named-individual and scene-depth checks skipped.`);
  }

  const passed = checks.every(check => check.ok) && warnings.length === 0;
  const report = {
    video_id: identity.isSaints ? `SAINTS-${String(identity.numeric).padStart(4, '0')}` : `VID-${String(identity.numeric).padStart(4, '0')}`,
    script_id: identity.isSaints ? id : Number(id),
    qc_status: passed ? 'passed' : 'failed',
    generated_at: new Date().toISOString(),
    checks,
    warnings,
    approval_required_before_public: true
  };

  const logDir = file('metadata/qc_reports');
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
