const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_DIR = path.join(__dirname, '..');
const DOCS_DIR = path.join(WORKSPACE_DIR, 'docs');
const REPORT_DIR = path.join(WORKSPACE_DIR, 'metadata', 'pm_reports');
const TODAY = parseDateArg(process.argv.find(arg => arg.startsWith('--date='))) || new Date();
const SHOULD_PUSH = process.argv.includes('--push-safe');
const SHOULD_COMMIT = process.argv.includes('--commit-safe') || SHOULD_PUSH;

const SENSITIVE_PATTERNS = [
  /^automation[\\/]credentials[\\/]/,
  /^metadata[\\/]uploads_tracker\.json$/,
  /^metadata[\\/]youtube_channel_status\.json$/,
  /^metadata[\\/]schedule_reservations\.json$/,
  /^metadata[\\/]pm_reports[\\/]/,
  /^videos[\\/]/,
  /^assets[\\/]video_.*_assets[\\/]/,
  /^.*\.mp4$/,
  /^.*\.env$/,
  /^\.env$/
];

function parseDateArg(arg) {
  if (!arg) return null;
  const value = arg.split('=').slice(1).join('=');
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function rel(filePath) {
  return path.relative(WORKSPACE_DIR, filePath).replace(/\\/g, '/');
}

function readJson(relPath, fallback) {
  const full = path.join(WORKSPACE_DIR, relPath);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function safeRead(relPath) {
  const full = path.join(WORKSPACE_DIR, relPath);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

function git(args) {
  const gitExe = 'C:\\Program Files\\Git\\cmd\\git.exe';
  const result = spawnSync(gitExe, args, { cwd: WORKSPACE_DIR, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    status: result.status
  };
}

function parseGitStatus() {
  const result = git(['status', '--porcelain']);
  if (!result.ok) return { ok: false, files: [], error: result.stderr || result.stdout };
  const files = result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => ({ status: line.slice(0, 2), file: line.slice(2).trim().replace(/\\/g, '/') }));
  return { ok: true, files };
}

function isSensitive(file) {
  const normalized = file.replace(/\\/g, '/');
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(normalized));
}

function extractMermaidTasks() {
  const source = safeRead('docs/channel_portfolio_gantt_schedule.md');
  const tasks = [];
  let section = 'Unassigned';
  for (const line of source.split(/\r?\n/)) {
    const sectionMatch = line.match(/^\s*section\s+(.+)$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const taskMatch = line.match(/^\s{4}(.+?)\s+:(done|active|milestone)?\s*,?\s*([a-z]+\d+)?,?\s*(\d{4}-\d{2}-\d{2}),\s*([^\s]+)\s*$/);
    if (!taskMatch) continue;
    const name = taskMatch[1].trim();
    const status = taskMatch[2] || 'planned';
    const start = new Date(`${taskMatch[4]}T12:00:00`);
    const durationToken = taskMatch[5];
    const durationDays = durationToken === '0d' ? 0 : Number.parseInt(durationToken, 10);
    const end = new Date(start);
    end.setDate(start.getDate() + Math.max(durationDays - 1, 0));
    tasks.push({ section, name, status, start, end, durationDays });
  }
  return tasks;
}

function classifyTasks(tasks) {
  const today = new Date(TODAY);
  today.setHours(12, 0, 0, 0);
  const soon = new Date(today);
  soon.setDate(today.getDate() + 7);

  return {
    active: tasks.filter(task => task.start <= today && task.end >= today),
    overdue: tasks.filter(task => task.end < today && !['done', 'milestone'].includes(task.status)),
    upcoming: tasks.filter(task => task.start > today && task.start <= soon),
    milestones: tasks.filter(task => task.status === 'milestone')
  };
}

function summarizeProductionStatus() {
  const statuses = readJson('metadata/production_status.json', []);
  return statuses.map(item => ({
    video_id: item.video_id,
    stage: item.current_stage,
    next: item.next_step,
    blocker: item.blocking_issue,
    file: item.file_path,
    updated: item.last_updated
  }));
}

function summarizeQueue() {
  const queue = readJson('metadata/queue.json', []);
  return {
    total: queue.length,
    scheduled: queue.filter(item => item.status === 'scheduled').length,
    replacements: queue.filter(item => item.replacement_for_uploaded_video).length,
    humanApproval: queue.filter(item => item.human_approval).length
  };
}

function fileExists(relPath) {
  return fs.existsSync(path.join(WORKSPACE_DIR, relPath));
}

function detectBlockers() {
  const blockers = [];
  if (!fileExists('docs/saints_episodes/001_saint_seraphim_of_sarov_research_brief.md')) {
    blockers.push('Missing Saint Seraphim research brief.');
  }
  if (!fileExists('docs/saints_episodes/001_saint_seraphim_of_sarov_episode_outline.md')) {
    blockers.push('Missing Saint Seraphim episode outline.');
  }
  if (!fileExists('saints_channel_config.json')) {
    blockers.push('Missing The Saints channel config.');
  }
  if (!fileExists('docs/channel_portfolio_gantt_schedule.md')) {
    blockers.push('Missing portfolio Gantt schedule.');
  }
  if (!fileExists('automation/credentials/oauth_tokens.json')) {
    blockers.push('YouTube OAuth tokens are missing locally.');
  }
  return blockers;
}

function markdownList(items, formatter) {
  if (!items.length) return '- None';
  return items.map(formatter).join('\n');
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function buildReport() {
  const tasks = extractMermaidTasks();
  const classified = classifyTasks(tasks);
  const gitStatus = parseGitStatus();
  const production = summarizeProductionStatus();
  const queue = summarizeQueue();
  const blockers = detectBlockers();
  const changedFiles = gitStatus.ok ? gitStatus.files : [];
  const sensitiveFiles = changedFiles.filter(item => isSensitive(item.file));
  const safeFiles = changedFiles.filter(item => !isSensitive(item.file));

  const report = `# PM Agent Portfolio Report\n\n` +
    `Generated: ${new Date().toISOString()}\n\n` +
    `Schedule date basis: ${formatDate(TODAY)}\n\n` +
    `## Executive Status\n\n` +
    `- Active schedule tasks: ${classified.active.length}\n` +
    `- Overdue schedule tasks: ${classified.overdue.length}\n` +
    `- Upcoming tasks in next 7 days: ${classified.upcoming.length}\n` +
    `- Production status records: ${production.length}\n` +
    `- Upload queue entries: ${queue.total}\n` +
    `- Replacement queue entries: ${queue.replacements}\n` +
    `- Local blockers detected: ${blockers.length}\n\n` +
    `## Active Tasks\n\n` +
    markdownList(classified.active, task => `- ${task.section}: ${task.name} (${formatDate(task.start)} to ${formatDate(task.end)})`) +
    `\n\n## Overdue Tasks\n\n` +
    markdownList(classified.overdue, task => `- ${task.section}: ${task.name} ended ${formatDate(task.end)}`) +
    `\n\n## Upcoming Tasks\n\n` +
    markdownList(classified.upcoming, task => `- ${task.section}: ${task.name} starts ${formatDate(task.start)}`) +
    `\n\n## Production Records\n\n` +
    markdownList(production, item => `- ${item.video_id}: ${item.stage}; next: ${item.next}; blocker: ${item.blocker || 'none'}`) +
    `\n\n## Queue Summary\n\n` +
    `- Total entries: ${queue.total}\n` +
    `- Scheduled status entries: ${queue.scheduled}\n` +
    `- Replacement entries: ${queue.replacements}\n` +
    `- Human approval entries: ${queue.humanApproval}\n\n` +
    `## Blockers\n\n` +
    markdownList(blockers, blocker => `- ${blocker}`) +
    `\n\n## Git Safety Review\n\n` +
    (gitStatus.ok ? '' : `Git status failed: ${gitStatus.error}\n\n`) +
    `Safe changed files:\n` +
    markdownList(safeFiles, item => `- ${item.status.trim() || 'M'} ${item.file}`) +
    `\n\nSensitive/local changed files, do not auto-push:\n` +
    markdownList(sensitiveFiles, item => `- ${item.status.trim() || 'M'} ${item.file}`) +
    `\n\n## Recommended Next Actions\n\n` +
    `1. Continue Saint Seraphim full script package.\n` +
    `2. Build Corporate Shadows visual upgrade workflow before public publishing more videos.\n` +
    `3. Keep private YouTube tracker/status files local unless explicitly approved for disclosure.\n` +
    `4. Start AI/B2B concept and offer map on 2026-06-10.\n`;

  return { report, safeFiles, sensitiveFiles, gitStatus };
}

function writeReport(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(REPORT_DIR, `pm_report_${stamp}.md`);
  fs.writeFileSync(outPath, report);
  const latestPath = path.join(REPORT_DIR, 'latest_pm_report.md');
  fs.writeFileSync(latestPath, report);
  return { outPath, latestPath };
}

function commitSafeFiles(safeFiles) {
  const files = safeFiles.map(item => item.file).filter(file => !file.startsWith('metadata/pm_reports/'));
  if (!files.length) return { committed: false, message: 'No safe files to commit.' };
  const add = git(['add', ...files]);
  if (!add.ok) return { committed: false, message: add.stderr || add.stdout };
  const commit = git(['commit', '-m', 'PM agent safe portfolio updates']);
  if (!commit.ok) return { committed: false, message: commit.stderr || commit.stdout };
  return { committed: true, message: commit.stdout };
}

function pushSafeCommit() {
  const push = git(['push']);
  return { pushed: push.ok, message: push.stdout || push.stderr };
}

function main() {
  const { report, safeFiles, sensitiveFiles } = buildReport();
  const paths = writeReport(report);
  console.log(report);
  console.log(`\nPM report written: ${rel(paths.latestPath)}`);

  if (SHOULD_COMMIT) {
    const commit = commitSafeFiles(safeFiles);
    console.log(`\nCommit safe files: ${commit.message}`);
    if (SHOULD_PUSH && commit.committed) {
      const push = pushSafeCommit();
      console.log(`Push safe commit: ${push.message}`);
    }
  }

  if (sensitiveFiles.length) {
    console.log('\nSensitive files remain local and were not committed automatically.');
  }
}

if (require.main === module) {
  main();
}


