/**
 * saints_queue_entry_agent.js
 *
 * Ensures a rendered Saints video has a metadata/queue.json upload entry.
 * This is a safe metadata step: no upload, no delete, no public publish.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, SAINTS_ROOT } = require('./channel_paths');

const ROOT = SAINTS_ROOT;
const SHARED_ROOT = REPO_ROOT;
const id = process.argv[2];
if (!id) throw new Error('Usage: node automation/saints_queue_entry_agent.js <video_id>');

const scriptPath = path.join(ROOT, 'scripts', `saints_video_${id}_data.js`);
const queuePath = path.join(ROOT, 'metadata', 'queue.json');
const filename = `SAINTS_VIDEO_${id}_FINAL.mp4`;
const srt = `SAINTS_VIDEO_${id}_FINAL.srt`;
const STORY_THUMBNAILS = {
  '1': 'Thumbnails/saints_video_1_generated_cinematic.png',
  '13': 'Thumbnails/IMDPK7f14wRX8.png',
  '14': 'Thumbnails/IMDJP6iX6oElw.png',
  '15': 'Thumbnails/IMbIutKtAvOXw.png',
  '16': 'Thumbnails/IMFOZfNOaP3HY.png',
  '17': 'Thumbnails/IMEVTu--_w3E8.png',
  '18': 'Thumbnails/IMAONiSrmYsgc.png',
  '19': 'Thumbnails/IMdWWrhNhywFU.png',
  '20': 'Thumbnails/IMa5r3HeMv3mk.png',
  '21': 'Thumbnails/saints_video_21_generated_cinematic.png',
  '22': 'Thumbnails/saints_video_22_generated_cinematic.png'
};
const PRAYER_THUMBNAILS = {
  '13': 'Thumbnails/IMeaTGslk9ewE.png',
  '20': 'Thumbnails/IMEcA-FkytyCg.png'
};

function isPrayerVideo(script = null) {
  const joined = [
    script?.video?.title,
    script?.video?.type,
    script?.production_notes?.format,
    script?.production_notes?.series
  ].filter(Boolean).join(' ');
  return /\b(prayer|akathist|akathis|canon|troparion|kontakion)\b/i.test(joined);
}

function resolveThumbnail(script = null) {
  if (isPrayerVideo(script)) return PRAYER_THUMBNAILS[id] || 'Thumbnails/IMeaTGslk9ewE.png';
  return STORY_THUMBNAILS[id] || `Thumbnails/saints_video_${id}_generated_cinematic.png`;
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function loadScript() {
  const raw = fs.readFileSync(scriptPath, 'utf8').replace(/^\uFEFF/, '');
  const match = raw.match(new RegExp(`window\\.SAINTS_SCRIPTS\\[${id}\\]\\s*=\\s*(\\{[\\s\\S]+\\})\\s*;?\\s*$`));
  if (!match) throw new Error(`Could not parse Saints script ${id}`);
  return JSON.parse(match[1]);
}

function chapters(scenes) {
  let total = 0;
  return scenes.map(scene => {
    const words = String(scene.voiceover || '').split(/\s+/).filter(Boolean).length;
    const stamp = `${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, '0')}`;
    total += Math.max(25, Math.round(words / 2.25));
    return { timestamp: stamp, title: scene.title, scene_number: scene.scene_number };
  });
}

function main() {
  if (!fs.existsSync(scriptPath)) throw new Error(`Missing script: ${scriptPath}`);
  const script = loadScript();
  const queue = readJson(queuePath, []);
  const existing = queue.find(item => item.filename === filename);
  const thumbnail = resolveThumbnail(script);
  const keywords = script.production_notes?.metadata_keywords || ['The Saints', 'Orthodox saints', 'Christian monasticism'];
  const cleanVo = String(script.scenes?.[0]?.voiceover || '').replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
  const firstLine = cleanVo.split('.').slice(0, 2).join('.').trim() + '.';
  const entry = {
    filename,
    source_path: `The Saints/videos/saints_ready/${filename}`,
    srt_filename: srt,
    srt_source_path: `The Saints/videos/saints_ready/${srt}`,
    thumbnail_filename: thumbnail,
    title: script.video.title,
    description: `${firstLine}\n\nThis reverent documentary tells the story through Orthodox witness and tradition, with careful attention to sources, humility, repentance, miracles, and grace.\n\nQuestion for viewers: what part of this story stayed with you most?\n\nThe Saints is a documentary channel about Orthodox and Catholic saints, elders, monks, miracles, repentance, courage, and grace.`,
    tags: keywords,
    category_id: '27',
    playlist_id: 'PLlnXQFiTNjOvWHt1UhXy6r29kGtnOmDB4',
    status: 'private',
    publish_days: [],
    publish_time: null,
    timezone: null,
    human_approval: false,
    channel: 'The Saints',
    script_id: `saints_${id}`,
    chapters: chapters(script.scenes || []),
    pinned_comment: 'What part of this saintly story stayed with you most?',
    watch_next_line: 'If this story stayed with you, watch another life from The Saints next.',
    release_policy: 'publish_immediately_when_ready'
  };

  if (existing) Object.assign(existing, entry);
  else queue.push(entry);
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  console.log(`${existing ? 'Updated' : 'Created'} queue entry for ${filename}`);
}

main();
