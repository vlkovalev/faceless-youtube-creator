const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '..');
const STATUS_FILE = path.join(WORKSPACE_DIR, 'metadata', 'production_status.json');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function updateStatus(videoId, patch) {
  const statuses = readJson(STATUS_FILE, []);
  let row = statuses.find(item => item.video_id === videoId);
  if (!row) {
    row = {
      video_id: videoId,
      current_stage: '',
      stage_owner_agent: '',
      last_completed_step: '',
      next_step: '',
      blocking_issue: '',
      file_path: '',
      error_message: '',
      retry_count: 0,
      last_updated: '',
      final_status: 'In Progress'
    };
    statuses.push(row);
  }

  Object.assign(row, patch, { last_updated: new Date().toISOString() });
  writeJson(STATUS_FILE, statuses);
  return row;
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  }));

  if (!args.video || !args.stage) {
    console.error('Usage: node status_agent.js --video=VID-0005 --stage=edited --last="Editing complete" --next="Run QC"');
    process.exit(1);
  }

  const row = updateStatus(args.video, {
    current_stage: args.stage,
    stage_owner_agent: args.owner || 'Pipeline Runner',
    last_completed_step: args.last || '',
    next_step: args.next || '',
    blocking_issue: String(args.blocking || '').toLowerCase() === 'none' ? '' : (args.blocking || ''),
    file_path: args.file || '',
    error_message: args.error || '',
    final_status: args.final || 'In Progress'
  });

  console.log(`Updated production status for ${row.video_id}: ${row.current_stage}`);
}

if (require.main === module) {
  main();
}

module.exports = { updateStatus };
