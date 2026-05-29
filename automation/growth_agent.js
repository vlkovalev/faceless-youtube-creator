const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '..');
const CONFIG_FILE = path.join(WORKSPACE_DIR, 'channel_config.json');
const QUEUE_FILE = path.join(WORKSPACE_DIR, 'metadata', 'queue.json');
const REPORT_FILE = path.join(WORKSPACE_DIR, 'metadata', 'growth_report.json');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hasChapters(entry) {
  return Array.isArray(entry.chapters) && entry.chapters.length >= 3 && /(^|\n)0:00\s+/.test(entry.description || '');
}

function hasPlaylist(entry, playlistTitle) {
  return Boolean(entry.playlist_id) || entry.playlist_title === playlistTitle;
}

function cadenceOk(entry, cadence) {
  const expectedDays = cadence.days || ['Tuesday', 'Friday'];
  const days = entry.publish_days || [];
  return expectedDays.every(day => days.includes(day)) && entry.publish_time === (cadence.time || '10:00');
}

function thumbnailRecord(entry) {
  return {
    filename: entry.filename,
    title: entry.title,
    target_ctr: entry.thumbnail_test && entry.thumbnail_test.target_ctr ? entry.thumbnail_test.target_ctr : '',
    actual_ctr: entry.thumbnail_test && entry.thumbnail_test.actual_ctr ? entry.thumbnail_test.actual_ctr : '',
    first_30s_retention: entry.thumbnail_test && entry.thumbnail_test.retention_first_30s ? entry.thumbnail_test.retention_first_30s : '',
    decision: entry.thumbnail_test && entry.thumbnail_test.decision ? entry.thumbnail_test.decision : 'measure after public release'
  };
}

function run() {
  const config = readJson(CONFIG_FILE, {});
  const growth = config.growth_system || {};
  const playlist = growth.primary_playlist || { title: 'Dark Business Empires' };
  const cadence = growth.publishing_cadence || { days: ['Tuesday', 'Friday'], time: '10:00' };
  const queue = readJson(QUEUE_FILE, []);
  const corporate = queue.filter(entry => /^FINAL_VIDEO_\d/.test(entry.filename));

  const checks = corporate.map(entry => ({
    filename: entry.filename,
    title: entry.title,
    playlist_ready: hasPlaylist(entry, playlist.title),
    playlist_id_present: Boolean(entry.playlist_id),
    chapters_ready: hasChapters(entry),
    cadence_ready: cadenceOk(entry, cadence),
    thumbnail_tracking_ready: Boolean(entry.thumbnail_test),
    public_release_gate: entry.human_approval ? 'approval required' : 'not gated'
  }));

  const blockers = [];
  for (const check of checks) {
    if (!check.chapters_ready) blockers.push(`${check.filename}: missing chapters in description`);
    if (!check.playlist_ready) blockers.push(`${check.filename}: missing playlist target`);
    if (!check.cadence_ready) blockers.push(`${check.filename}: cadence is not ${cadence.days.join('/')} ${cadence.time}`);
    if (!check.thumbnail_tracking_ready) blockers.push(`${check.filename}: missing thumbnail tracking fields`);
  }

  const report = {
    generated_at: new Date().toISOString(),
    channel: config.channel && config.channel.name ? config.channel.name : 'Corporate Shadows',
    primary_playlist: playlist,
    publishing_cadence: cadence,
    summary: {
      videos_checked: checks.length,
      blockers: blockers.length,
      playlist_id_pending: checks.filter(check => !check.playlist_id_present).length,
      ready_for_distribution_sprint: blockers.length === 0
    },
    checks,
    thumbnail_tracking: corporate.map(thumbnailRecord),
    next_actions: [
      'Create or identify the YouTube playlist Dark Business Empires and fill growth_system.primary_playlist.youtube_playlist_id.',
      'Regenerate metadata for every video before upload so descriptions include chapters.',
      'After each public release, fill actual CTR and first-30-second retention for thumbnail decisions.',
      'Keep Tuesday/Friday cadence unless a video has a legal, factual, or serious brand-risk blocker.'
    ]
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(`Growth report written: ${path.relative(WORKSPACE_DIR, REPORT_FILE)}`);
  console.log(`Videos checked: ${report.summary.videos_checked}`);
  console.log(`Blockers: ${report.summary.blockers}`);
  console.log(`Playlist ID pending: ${report.summary.playlist_id_pending}`);
  if (blockers.length) {
    console.log('\nBlockers:');
    blockers.forEach(blocker => console.log(`- ${blocker}`));
  }
}

run();