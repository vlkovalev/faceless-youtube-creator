const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_DIR = path.join(__dirname, '..');
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

const CHANNEL_OWNERS = {
  'Corporate Shadows': 'Corporate Shadows Production Lead',
  'The Saints': 'The Saints Production Lead',
  'AI / B2B Automation Channel': 'AI/B2B Systems Lead',
  'Shared Systems': 'Portfolio PM Agent'
};

function parseDateArg(arg) {
  if (!arg) return null;
  const value = arg.split('=').slice(1).join('=');
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function todayNoon() {
  const today = new Date(TODAY);
  today.setHours(12, 0, 0, 0);
  return today;
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
    const id = taskMatch[3] || slug(name);
    const start = new Date(`${taskMatch[4]}T12:00:00`);
    const durationToken = taskMatch[5];
    const durationDays = durationToken === '0d' ? 0 : Number.parseInt(durationToken, 10);
    const end = new Date(start);
    end.setDate(start.getDate() + Math.max(durationDays - 1, 0));
    tasks.push({ id, section, name, status, start, end, durationDays, owner: CHANNEL_OWNERS[section] || 'Portfolio PM Agent' });
  }
  return tasks;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function classifyTasks(tasks) {
  const today = todayNoon();
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
    updated: item.last_updated,
    final: item.final_status
  }));
}

function summarizeQueue() {
  const queue = readJson('metadata/queue.json', []);
  return {
    total: queue.length,
    scheduled: queue.filter(item => item.status === 'scheduled').length,
    replacements: queue.filter(item => item.replacement_for_uploaded_video).length,
    humanApproval: queue.filter(item => item.human_approval).length,
    privateDraftCandidates: queue.filter(item => item.replacement_for_uploaded_video).map(item => item.filename)
  };
}

function fileExists(relPath) {
  return fs.existsSync(path.join(WORKSPACE_DIR, relPath));
}

function detectBlockers() {
  const blockers = [];
  if (!fileExists('docs/saints_episodes/001_saint_seraphim_of_sarov_research_brief.md')) blockers.push('Missing Saint Seraphim research brief.');
  if (!fileExists('docs/saints_episodes/001_saint_seraphim_of_sarov_episode_outline.md')) blockers.push('Missing Saint Seraphim episode outline.');
  if (!fileExists('saints_channel_config.json')) blockers.push('Missing The Saints channel config.');
  if (!fileExists('docs/channel_portfolio_gantt_schedule.md')) blockers.push('Missing portfolio Gantt schedule.');
  if (!fileExists('automation/credentials/oauth_tokens.json')) blockers.push('YouTube OAuth tokens are missing locally.');
  if (!fileExists('docs/agents/agent_registry.md')) blockers.push('Missing agent registry.');
  return blockers;
}

function buildRaid(tasks, classified, production, blockers, sensitiveFiles) {
  const risks = [];
  const assumptions = [];
  const issues = [];
  const dependencies = [];

  if (classified.overdue.length) issues.push(`${classified.overdue.length} schedule task(s) are overdue.`);
  if (sensitiveFiles.length) risks.push('Private YouTube tracker/status files have local changes and must not be pushed automatically.');
  if (production.some(item => String(item.blocker || '').toLowerCase().includes('placeholder'))) risks.push('Some Corporate Shadows videos may still rely on placeholder visuals.');
  if (production.some(item => String(item.blocker || '').toLowerCase().includes('public publishing'))) risks.push('Public publishing remains approval-gated.');
  if (blockers.length) issues.push(...blockers);

  assumptions.push('Corporate Shadows remains the active/live channel until The Saints channel is created.');
  assumptions.push('The Saints will be a separate channel, not uploaded through Corporate Shadows.');
  assumptions.push('AI/B2B automation content must be based on tested workflows, not generic AI news.');

  dependencies.push('The Saints channel creation depends on user/Google account channel setup and separate OAuth routing.');
  dependencies.push('Public publishing depends on explicit channel-level approval and final QC.');
  dependencies.push('Custom thumbnails depend on YouTube account permission/verification.');
  dependencies.push('AI/B2B launch depends on working templates/downloadables and tested automations.');

  return { risks, assumptions, issues, dependencies };
}

function getRagStatus(classified, blockers, sensitiveFiles) {
  if (classified.overdue.length > 2 || blockers.length > 1) return 'RED';
  if (classified.overdue.length || blockers.length || sensitiveFiles.length) return 'AMBER';
  return 'GREEN';
}

function buildDecisionLog(classified, production) {
  const decisions = [];
  if (production.some(item => String(item.blocker || '').includes('Public publishing'))) {
    decisions.push('Public release approval is still required before any scheduled/public upload goes live.');
  }
  if (classified.upcoming.some(task => task.name.includes('Create actual Saints YouTube channel'))) {
    decisions.push('The Saints channel/Brand Account needs to be created before the first private draft upload target.');
  }
  decisions.push('Decide whether Corporate Shadows visuals must be replaced before publishing videos 4-5 publicly.');
  decisions.push('Decide whether AI/B2B channel launch remains August 7 or moves earlier/later after pilot review.');
  return decisions;
}

function buildKpis(tasks, classified, production, queue) {
  const completed = tasks.filter(task => task.status === 'done').length;
  const taskCompletion = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const blockedProduction = production.filter(item => item.blocker && item.blocker !== '');
  return {
    taskCompletion,
    activeTasks: classified.active.length,
    overdueTasks: classified.overdue.length,
    upcomingTasks: classified.upcoming.length,
    productionRecords: production.length,
    blockedProduction: blockedProduction.length,
    queueEntries: queue.total,
    replacementEntries: queue.replacements
  };
}

function markdownList(items, formatter) {
  if (!items.length) return '- None';
  return items.map(formatter).join('\n');
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function table(rows, headers) {
  if (!rows.length) return '- None';
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(row => `| ${headers.map(header => String(row[header] ?? '').replace(/\|/g, '/')).join(' | ')} |`);
  return [head, sep, ...body].join('\n');
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
  const raid = buildRaid(tasks, classified, production, blockers, sensitiveFiles);
  const rag = getRagStatus(classified, blockers, sensitiveFiles);
  const decisions = buildDecisionLog(classified, production);
  const kpis = buildKpis(tasks, classified, production, queue);

  const activeRows = classified.active.map(task => ({ Lane: task.section, Task: task.name, Owner: task.owner, Start: formatDate(task.start), End: formatDate(task.end), Status: task.status }));
  const upcomingRows = classified.upcoming.map(task => ({ Lane: task.section, Task: task.name, Owner: task.owner, Start: formatDate(task.start), End: formatDate(task.end) }));
  const overdueRows = classified.overdue.map(task => ({ Lane: task.section, Task: task.name, Owner: task.owner, Ended: formatDate(task.end) }));

  const stakeholderSummary = `Status: ${rag}. Active tasks: ${kpis.activeTasks}. Overdue: ${kpis.overdueTasks}. Main focus is Saint Seraphim script package and Corporate Shadows visual upgrade workflow. Sensitive YouTube tracker/status files remain local and are excluded from auto-push.`;

  const report = `# PM Agent Portfolio Report\n\n` +
    `Generated: ${new Date().toISOString()}\n\n` +
    `Schedule date basis: ${formatDate(TODAY)}\n\n` +
    `## Report To Vlad\n\n` +
    `${stakeholderSummary}\n\n` +
    `## Executive Dashboard\n\n` +
    `- Overall RAG status: **${rag}**\n` +
    `- Schedule completion: ${kpis.taskCompletion}%\n` +
    `- Active schedule tasks: ${kpis.activeTasks}\n` +
    `- Overdue schedule tasks: ${kpis.overdueTasks}\n` +
    `- Upcoming tasks in next 7 days: ${kpis.upcomingTasks}\n` +
    `- Production records: ${kpis.productionRecords}\n` +
    `- Blocked production records: ${kpis.blockedProduction}\n` +
    `- Upload queue entries: ${kpis.queueEntries}\n` +
    `- Replacement queue entries: ${kpis.replacementEntries}\n\n` +
    `## This PM Agent Is Responsible For\n\n` +
    `- Schedule control and weekly plan review\n` +
    `- Dependency tracking across channels\n` +
    `- RAID log: risks, assumptions, issues, dependencies\n` +
    `- Blocker escalation and decision tracking\n` +
    `- Git safety review before commits/pushes\n` +
    `- Production readiness review\n` +
    `- Stakeholder reporting to Vlad\n` +
    `- Keeping private YouTube data out of GitHub\n\n` +
    `## Active Tasks\n\n` + table(activeRows, ['Lane', 'Task', 'Owner', 'Start', 'End', 'Status']) +
    `\n\n## Overdue Tasks\n\n` + table(overdueRows, ['Lane', 'Task', 'Owner', 'Ended']) +
    `\n\n## Upcoming Tasks\n\n` + table(upcomingRows, ['Lane', 'Task', 'Owner', 'Start', 'End']) +
    `\n\n## Production Records\n\n` +
    markdownList(production, item => `- ${item.video_id}: ${item.stage}; next: ${item.next}; blocker: ${item.blocker || 'none'}`) +
    `\n\n## RAID Log\n\n` +
    `### Risks\n` + markdownList(raid.risks, item => `- ${item}`) +
    `\n\n### Assumptions\n` + markdownList(raid.assumptions, item => `- ${item}`) +
    `\n\n### Issues\n` + markdownList(raid.issues, item => `- ${item}`) +
    `\n\n### Dependencies\n` + markdownList(raid.dependencies, item => `- ${item}`) +
    `\n\n## Decisions Needed\n\n` + markdownList(decisions, item => `- ${item}`) +
    `\n\n## Queue Summary\n\n` +
    `- Total entries: ${queue.total}\n` +
    `- Scheduled status entries: ${queue.scheduled}\n` +
    `- Replacement entries: ${queue.replacements}\n` +
    `- Human approval entries: ${queue.humanApproval}\n\n` +
    `## Git Safety Review\n\n` +
    (gitStatus.ok ? '' : `Git status failed: ${gitStatus.error}\n\n`) +
    `Safe changed files:\n` + markdownList(safeFiles, item => `- ${item.status.trim() || 'M'} ${item.file}`) +
    `\n\nSensitive/local changed files, do not auto-push:\n` + markdownList(sensitiveFiles, item => `- ${item.status.trim() || 'M'} ${item.file}`) +
    `\n\n## Recommended Next Actions\n\n` +
    `1. Continue Saint Seraphim full script package.\n` +
    `2. Build Corporate Shadows visual upgrade workflow before public publishing more videos.\n` +
    `3. Keep private YouTube tracker/status files local unless explicitly approved for disclosure.\n` +
    `4. Start AI/B2B concept and offer map on 2026-06-10.\n` +
    `5. Report this summary to Vlad in the daily status check-in.\n`;

  const brief = `PM Status (${formatDate(TODAY)}): ${stakeholderSummary}`;
  return { report, brief, safeFiles, sensitiveFiles, gitStatus };
}

function writeReport(report, brief) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(REPORT_DIR, `pm_report_${stamp}.md`);
  fs.writeFileSync(outPath, report);
  const latestPath = path.join(REPORT_DIR, 'latest_pm_report.md');
  fs.writeFileSync(latestPath, report);
  const briefPath = path.join(REPORT_DIR, 'latest_pm_brief.txt');
  fs.writeFileSync(briefPath, brief);
  return { outPath, latestPath, briefPath };
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
  const { report, brief, safeFiles, sensitiveFiles } = buildReport();
  const paths = writeReport(report, brief);
  console.log(report);
  console.log(`\nPM report written: ${rel(paths.latestPath)}`);
  console.log(`PM brief written: ${rel(paths.briefPath)}`);

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
