const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '..');
const CHANNEL_CONFIG = path.join(WORKSPACE_DIR, 'channel_config.json');
const QUEUE_FILE = path.join(WORKSPACE_DIR, 'metadata', 'queue.json');

const SCRIPT_ID = process.argv[2] || '5';

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function sentenceFromVoiceover(script) {
  const cleaned = script.scenes
    .map(scene => scene.voiceover.replace(/<[^>]*>?/g, '').trim())
    .join(' ')
    .replace(/\.{2,}/g, '.')
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
    'shadow empires'
  ];
  const keywords = `${title} ${topic}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 4)
    .slice(0, 5);
  return [...new Set([...keywords, ...base])].slice(0, 12);
}

function buildQueueEntry(id) {
  const config = readJson(CHANNEL_CONFIG, {});
  const idea = (config.viral_ideas || []).find(item => String(item.id) === String(id));
  const script = getScript(id);
  const title = script.video.title;
  const topic = idea ? idea.topic : title;
  const intro = sentenceFromVoiceover(script);

  return {
    filename: `FINAL_VIDEO_${id}.mp4`,
    srt_filename: `FINAL_VIDEO_${id}.srt`,
    thumbnail_filename: id === '1' ? 'youtube_thumbnail.png' : `youtube_thumbnail_video_${id}.png`,
    title,
    description: `${intro}.\n\nThis is the dark business history behind ${topic}\n\nSubscribe to Shadow Empires for more corporate scandals, hidden monopolies, and stories of power gone wrong.`,
    tags: tagsFor(title, topic),
    category_id: '27',
    playlist_id: '',
    status: 'scheduled',
    publish_days: ['Tuesday', 'Friday'],
    publish_time: '10:00',
    timezone: 'America/Denver',
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
}

if (require.main === module) {
  main();
}

module.exports = { upsertQueueEntry };
