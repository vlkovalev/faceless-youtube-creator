const fs = require('fs');
const path = require('path');
const { upsertQueueEntry } = require('./metadata_agent');

const WORKSPACE_DIR = path.join(__dirname, '..');
const QUEUE_FILE = path.join(WORKSPACE_DIR, 'metadata', 'queue.json');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['1', '2', '3'];

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function copyIfPresent(source, destination) {
  const sourcePath = path.join(WORKSPACE_DIR, source);
  const destinationPath = path.join(WORKSPACE_DIR, destination);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source file: ${source}`);
  }
  fs.copyFileSync(sourcePath, destinationPath);
}

function upsertReplacement(id) {
  const base = upsertQueueEntry(id);
  const revisedVideo = `FINAL_VIDEO_${id}_REVISED.mp4`;
  const revisedSrt = `FINAL_VIDEO_${id}_REVISED.srt`;
  copyIfPresent(`FINAL_VIDEO_${id}.mp4`, revisedVideo);
  copyIfPresent(`FINAL_VIDEO_${id}.srt`, revisedSrt);

  const queue = readJson(QUEUE_FILE, []);
  const entry = {
    ...base,
    filename: revisedVideo,
    srt_filename: revisedSrt,
    revision_of: `FINAL_VIDEO_${id}.mp4`,
    replacement_for_uploaded_video: true,
    human_approval: true
  };

  const index = queue.findIndex(item => item.filename === revisedVideo);
  if (index >= 0) queue[index] = { ...queue[index], ...entry };
  else queue.push(entry);
  writeJson(QUEUE_FILE, queue);

  console.log(`Replacement queue entry ready: ${revisedVideo}`);
}

for (const id of ids) {
  upsertReplacement(String(id));
}
