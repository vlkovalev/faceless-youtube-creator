/** Packages rendered Saints prayer companions for private upload. No upload occurs here. */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT, SAINTS_ROOT } = require('./channel_paths');

const requested = process.argv.slice(2).filter(arg => /^\d+$/.test(arg));
const ids = requested.length ? requested : ['13', '14', '15', '16', '17', '18', '19', '20', '2', '3', '4', '5', '6', '7'];
const queuePath = path.join(SAINTS_ROOT, 'metadata', 'queue.json');
const ffprobe = path.join(REPO_ROOT, 'automation', 'ffmpeg', 'bin', 'ffprobe.exe');

function loadPrayer(id) {
  const file = path.join(SAINTS_ROOT, 'scripts', `saints_video_${id}_prayer_data.js`);
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const match = raw.match(new RegExp(`window\\.SAINTS_PRAYER_COMPANIONS\\[${id}\\]\\s*=\\s*(\\{[\\s\\S]+\\})\\s*;?\\s*$`));
  if (!match) throw new Error(`Could not parse prayer script ${id}`);
  return JSON.parse(match[1]);
}

function duration(file) {
  const result = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || `ffprobe failed for ${file}`);
  return Number(result.stdout.trim());
}

function timestamp(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function main() {
  const queue = fs.existsSync(queuePath) ? JSON.parse(fs.readFileSync(queuePath, 'utf8').replace(/^\uFEFF/, '')) : [];
  for (const id of ids) {
    const prayer = loadPrayer(id);
    if (!prayer.rights_verified) throw new Error(`Prayer ${id} is not rights verified.`);
    const filename = `SAINTS_PRAYER_${id}_FINAL.mp4`;
    const video = path.join(SAINTS_ROOT, 'videos', 'saints_prayers_ready', filename);
    const srt = path.join(SAINTS_ROOT, 'videos', 'saints_prayers_ready', `SAINTS_PRAYER_${id}_FINAL.srt`);
    const thumbnail = path.join(SAINTS_ROOT, 'assets', 'Thumbnails', `saints_prayer_${id}_thumbnail.png`);
    for (const required of [video, srt, thumbnail]) if (!fs.existsSync(required)) throw new Error(`Missing prayer package file: ${required}`);

    let cursor = 0;
    const chapters = prayer.sections.map((section, index) => {
      const audio = path.join(SAINTS_ROOT, 'assets', `saints_video_${id}_assets`, `section_${section.section_id}_audio.wav`);
      const chapter = { timestamp: timestamp(cursor), title: section.title, section_number: index + 1 };
      cursor += duration(audio);
      return chapter;
    });
    const sources = (prayer.source_notes || []).map(source => `${source.title}: ${source.url}`).join('\n');
    const isAkathist = /akathist/i.test(prayer.video.title || '')
      || (prayer.sections || []).some(section => /^(ikos|kontakion)\b/i.test(section.title || ''));
    const akathistsAttribution = isAkathist
      ? '\n\nAkathist text used with permission from Akathists.com.'
      : '';
    const description = `Pray with the on-screen text and a reverent icon.\n\n${prayer.pastoral_context?.disclaimer || ''}\n\nPrayer/source notes:\n${sources}${akathistsAttribution}\n\nThe Saints presents Orthodox and Catholic lives, prayers, repentance, courage, and grace.`;
    const entry = {
      filename,
      source_path: `The Saints/videos/saints_prayers_ready/${filename}`,
      srt_filename: `SAINTS_PRAYER_${id}_FINAL.srt`,
      srt_source_path: `The Saints/videos/saints_prayers_ready/SAINTS_PRAYER_${id}_FINAL.srt`,
      thumbnail_filename: `Thumbnails/saints_prayer_${id}_thumbnail.png`,
      title: prayer.video.title,
      description,
      tags: ['The Saints', 'Orthodox prayer', prayer.video.title.replace(/\s*\|.*$/, ''), 'prayer with text', 'Christian prayer'],
      category_id: '27',
      playlist_id: 'PLlnXQFiTNjOvWHt1UhXy6r29kGtnOmDB4',
      status: 'private',
      publish_days: [],
      publish_time: null,
      timezone: null,
      human_approval: false,
      channel: 'The Saints',
      content_type: 'prayer_companion',
      script_id: `saints_${id}_prayer`,
      rights_verified: true,
      chapters,
      pinned_comment: 'Share the name or intention you are praying for today.',
      watch_next_line: 'Continue with the companion life of this saint on The Saints.',
      release_policy: 'private_draft_only'
    };
    const existing = queue.find(item => item.filename === filename);
    if (existing) Object.assign(existing, entry); else queue.push(entry);
    console.log(`${existing ? 'Updated' : 'Created'} ${filename}`);
  }
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
}

main();
