const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '..');
const CHANNEL_CONFIG = path.join(WORKSPACE_DIR, 'channel_config.json');
const QUEUE_FILE = path.join(WORKSPACE_DIR, 'metadata', 'queue.json');

const SCRIPT_ID = process.argv[2] || '5';
const WORDS_PER_SECOND = 2.25;

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getScript(id) {
  const dataPath = path.join(WORKSPACE_DIR, 'scripts', `video_${id}_data.js`);
  const source = fs.readFileSync(dataPath, 'utf8');
  const match = source.match(new RegExp(`window\\.SCRIPTS\\[${id}\\]\\s*=\\s*(\\{[\\s\\S]+\\});`));
  if (!match) throw new Error(`Could not parse script data for video ${id}`);
  return JSON.parse(match[1]);
}

function cleanVoiceover(text) {
  return text
    .replace(/<[^>]*>?/g, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function estimateDurationSeconds(voiceover) {
  const clean = cleanVoiceover(voiceover);
  const words = clean ? clean.split(/\s+/).length : 0;
  const pauses = (voiceover.match(/<span class="pause">/g) || []).length;
  return Math.max(8, Math.round(words / WORDS_PER_SECOND + pauses * 1.5));
}

function formatTimestamp(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function buildChapters(script) {
  let cursor = 0;
  return script.scenes.map((scene, index) => {
    const chapter = {
      timestamp: formatTimestamp(index === 0 ? 0 : cursor),
      title: scene.title,
      scene_number: scene.scene_number || index + 1,
      estimated_duration_seconds: estimateDurationSeconds(scene.voiceover || '')
    };
    cursor += chapter.estimated_duration_seconds;
    return chapter;
  });
}

function sentenceFromVoiceover(script) {
  const cleaned = script.scenes
    .map(scene => cleanVoiceover(scene.voiceover))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  return sentences
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 10)
    .slice(0, 2)
    .join(' ')
    .replace(/[.!?]$/, '');
}

function tagsFor(title, topic) {
  const base = [
    'dark business history',
    'corporate scandals',
    'corporate history',
    'business documentary',
    'shadow empires'
  ];
  const keywords = `${title} ${topic}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 4)
    .slice(0, 7);
  return [...new Set([...keywords, ...base])].slice(0, 15);
}

function chapterText(chapters) {
  return chapters.map(chapter => `${chapter.timestamp} ${chapter.title}`).join('\n');
}

function getGrowthConfig(config) {
  return config.growth_system || {};
}

function buildDescription({ intro, topic, chapters, playlistTitle }) {
  return [
    `${intro}.`,
    '',
    `This is the dark business history behind ${topic}`,
    '',
    'Chapters:',
    chapterText(chapters),
    '',
    playlistTitle ? `Watch the full ${playlistTitle} series on this channel.` : '',
    'Subscribe to Shadow Empires for more corporate scandals, hidden monopolies, and stories of power gone wrong.'
  ].filter(line => line !== '').join('\n');
}

function buildQueueEntry(id) {
  const config = readJson(CHANNEL_CONFIG, {});
  const growth = getGrowthConfig(config);
  const playlist = growth.primary_playlist || {};
  const cadence = growth.publishing_cadence || {};
  const idea = (config.viral_ideas || []).find(item => String(item.id) === String(id));
  const script = getScript(id);
  const title = script.video.title;
  const topic = idea ? idea.topic : title;
  const intro = sentenceFromVoiceover(script);
  const chapters = buildChapters(script);
  const targetCtr = idea ? idea.target_ctr : '';

  return {
    filename: `FINAL_VIDEO_${id}.mp4`,
    srt_filename: `FINAL_VIDEO_${id}.srt`,
    thumbnail_filename: id === '1' ? 'youtube_thumbnail.png' : `youtube_thumbnail_video_${id}.png`,
    title,
    description: buildDescription({ intro, topic, chapters, playlistTitle: playlist.title }),
    chapters,
    tags: tagsFor(title, topic),
    category_id: '27',
    playlist_id: playlist.youtube_playlist_id || '',
    playlist_title: playlist.title || 'Dark Business Empires',
    status: 'scheduled',
    publish_days: cadence.days || ['Tuesday', 'Friday'],
    publish_time: cadence.time || '10:00',
    timezone: cadence.timezone || 'America/Denver',
    thumbnail_test: {
      target_ctr: targetCtr,
      actual_ctr: '',
      retention_first_30s: '',
      decision: 'measure after public release'
    },
    human_approval: true
  };
}

function upsertQueueEntry(id) {
  const queue = readJson(QUEUE_FILE, []);
  const entry = buildQueueEntry(id);
  const index = queue.findIndex(item => item.filename === entry.filename);
  if (index >= 0) queue[index] = { ...queue[index], ...entry };
  else queue.push(entry);
  writeJson(QUEUE_FILE, queue);
  return entry;
}

function main() {
  const entry = upsertQueueEntry(SCRIPT_ID);
  console.log(`Metadata queue entry ready: ${entry.filename}`);
  console.log(`Title: ${entry.title}`);
  console.log(`Playlist: ${entry.playlist_title}${entry.playlist_id ? ` (${entry.playlist_id})` : ' (id pending)'}`);
  console.log(`Chapters: ${entry.chapters.length}`);
  console.log(`Cadence: ${entry.publish_days.join('/')} at ${entry.publish_time} ${entry.timezone}`);
}

if (require.main === module) {
  main();
}

module.exports = { upsertQueueEntry, buildChapters, formatTimestamp };
