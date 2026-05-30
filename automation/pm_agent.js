const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_DIR = path.join(__dirname, '..');
const METADATA_DIR = path.join(WORKSPACE_DIR, 'metadata');
const REPORT_DIR = path.join(METADATA_DIR, 'pm_reports');
const DOCS_DIR = path.join(WORKSPACE_DIR, 'docs');
const TODAY = parseDateArg(process.argv.find(arg => arg.startsWith('--date='))) || new Date();
const SHOULD_PUSH = process.argv.includes('--push-safe');
const SHOULD_COMMIT = process.argv.includes('--commit-safe') || SHOULD_PUSH;

const PORTFOLIO_CALENDAR = 'metadata/portfolio_content_calendar.json';
const DEPENDENCIES_FILE = 'metadata/pm_dependency_rules.json';
const CAPACITY_FILE = 'metadata/pm_capacity_plan.json';
const DASHBOARD_FILE = 'docs/pm_dashboard.html';

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

function file(relPath) {
  return path.join(WORKSPACE_DIR, relPath);
}

function readJson(relPath, fallback) {
  const full = file(relPath);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(relPath, data) {
  const full = file(relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2));
}

function safeRead(relPath) {
  const full = file(relPath);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

function fileExists(relPath) {
  return fs.existsSync(file(relPath));
}

function git(args) {
  const gitExe = 'C:\\Program Files\\Git\\cmd\\git.exe';
  const result = spawnSync(gitExe, args, { cwd: WORKSPACE_DIR, encoding: 'utf8' });
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim(), status: result.status };
}

function parseGitStatus() {
  const result = git(['status', '--porcelain']);
  if (!result.ok) return { ok: false, files: [], error: result.stderr || result.stdout };
  const files = result.stdout.split(/\r?\n/).filter(Boolean).map(line => ({ status: line.slice(0, 2), file: line.slice(2).trim().replace(/\\/g, '/') }));
  return { ok: true, files };
}

function isSensitive(fileName) {
  const normalized = fileName.replace(/\\/g, '/');
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(normalized));
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

function inferTaskState(task) {
  const today = todayNoon();
  if (task.status === 'done') return 'done';
  if (task.status === 'milestone') return task.start < today ? 'milestone_due_or_passed' : 'milestone_upcoming';
  if (task.start <= today && task.end >= today) return 'active';
  if (task.end < today) return 'delayed';
  return 'planned';
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

function getSeverity(text) {
  const value = String(text || '').toLowerCase();
  if (!value || value === 'none') return 'P3';
  if (value.includes('credential') || value.includes('oauth') || value.includes('missing') || value.includes('public publishing')) return 'P1';
  if (value.includes('placeholder') || value.includes('quality') || value.includes('thumbnail')) return 'P2';
  return 'P3';
}

function summarizeProductionStatus() {
  const statuses = readJson('metadata/production_status.json', []);
  return statuses.map(item => ({
    video_id: item.video_id,
    stage: item.current_stage,
    next: item.next_step,
    blocker: item.blocking_issue,
    severity: getSeverity(item.blocking_issue),
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

function createDefaultDependencyRules() {
  const rules = [
    { id: 'dep-saints-channel', channel: 'The Saints', severity: 'P1', rule: 'Do not upload The Saints videos until a separate YouTube channel/Brand Account and OAuth routing exist.', check: 'manual', status: 'open' },
    { id: 'dep-corporate-visuals', channel: 'Corporate Shadows', severity: 'P2', rule: 'Do not public publish Corporate Shadows videos that rely on placeholder visuals.', check: 'metadata/qc_reports and asset manifests', status: 'open' },
    { id: 'dep-public-approval', channel: 'All', severity: 'P1', rule: 'Do not publish publicly without explicit approval.', check: 'human approval gate', status: 'active' },
    { id: 'dep-custom-thumbnails', channel: 'All', severity: 'P2', rule: 'Custom thumbnails require YouTube account permission/verification.', check: 'YouTube upload warning', status: 'open' },
    { id: 'dep-ai-tested-workflows', channel: 'AI / B2B Automation Channel', severity: 'P1', rule: 'Do not launch AI/B2B channel until at least 3 workflows are tested and template-backed.', check: 'workflow artifacts', status: 'planned' }
  ];
  writeJson(DEPENDENCIES_FILE, rules);
  return rules;
}

function ensureDependencyRules() {
  const existing = readJson(DEPENDENCIES_FILE, null);
  if (existing && Array.isArray(existing) && existing.length) return existing;
  return createDefaultDependencyRules();
}

function createDefaultCapacityPlan() {
  const plan = {
    weekly_capacity_units: 10,
    lanes: [
      { channel: 'Corporate Shadows', weekly_capacity_units: 4, cadence_goal: '1-2 production actions/week until visual workflow stabilizes' },
      { channel: 'The Saints', weekly_capacity_units: 4, cadence_goal: '1 complete long-form episode every 2-3 weeks at first' },
      { channel: 'AI / B2B Automation Channel', weekly_capacity_units: 2, cadence_goal: 'research/prototype only until July pilots' }
    ],
    task_unit_estimates: {
      research_brief: 1,
      full_script: 2,
      scene_table: 1,
      visual_package: 2,
      voiceover_edit_qc: 3,
      upload_packaging: 1
    }
  };
  writeJson(CAPACITY_FILE, plan);
  return plan;
}

function ensureCapacityPlan() {
  const existing = readJson(CAPACITY_FILE, null);
  if (existing && existing.lanes) return existing;
  return createDefaultCapacityPlan();
}

function inferContentCalendar() {
  const queue = readJson('metadata/queue.json', []);
  const existingCalendar = readJson('metadata/content_calendar.json', []);
  const saintsConfig = readJson('saints_channel_config.json', { first_backlog: [] });
  const items = [];

  for (const item of queue) {
    const videoNumber = (item.filename.match(/FINAL_VIDEO_(\d+)/) || [])[1] || '';
    items.push({
      id: item.replacement_for_uploaded_video ? `CS-${videoNumber}-REV` : `CS-${videoNumber || slug(item.title)}`,
      channel: 'Corporate Shadows',
      episode_id: videoNumber,
      topic: item.title,
      status: item.replacement_for_uploaded_video ? 'private-replacement-ready' : 'queued',
      owner: 'Corporate Shadows Production Lead',
      script_path: videoNumber ? `scripts/video_${videoNumber}_data.js` : '',
      video_path: item.filename,
      captions_path: item.srt_filename || '',
      thumbnail_path: item.thumbnail_filename ? `assets/${item.thumbnail_filename}` : '',
      upload_status: item.replacement_for_uploaded_video ? 'private draft uploaded/local tracker' : item.status,
      publish_target: item.publish_time || '',
      blocker: item.human_approval ? 'Public publishing requires approval' : '',
      priority: item.replacement_for_uploaded_video ? 70 : 80
    });
  }

  for (const item of existingCalendar) {
    if (!items.some(existing => existing.id === item.id)) {
      items.push({
        id: item.id,
        channel: 'Corporate Shadows',
        episode_id: String(item.script_id || ''),
        topic: item.title || item.topic,
        status: item.status || item.publish_status || 'planned',
        owner: 'Corporate Shadows Production Lead',
        script_path: item.script_file_url || '',
        video_path: item.final_video_url || '',
        captions_path: item.final_video_url ? item.final_video_url.replace(/\.mp4$/, '.srt') : '',
        thumbnail_path: item.thumbnail_url || '',
        upload_status: item.publish_status || '',
        publish_target: item.assigned_publish_date || '',
        blocker: item.notes || '',
        priority: item.priority || 70
      });
    }
  }

  for (const saint of saintsConfig.first_backlog || []) {
    items.push({
      id: `SAINT-${String(saint.id).padStart(3, '0')}`,
      channel: 'The Saints',
      episode_id: String(saint.id),
      topic: saint.title,
      status: saint.id === 1 ? 'research-outline-ready' : saint.status || 'research_ready',
      owner: 'The Saints Production Lead',
      script_path: saint.id === 1 ? 'docs/saints_episodes/001_saint_seraphim_of_sarov_script_v1.md' : '',
      video_path: '',
      captions_path: '',
      thumbnail_path: '',
      upload_status: 'not-uploaded',
      publish_target: '',
      blocker: saint.id === 1 ? 'Needs full script package' : 'Needs research brief and outline',
      priority: saint.id === 1 ? 95 : 65
    });
  }

  items.push({
    id: 'AI-001',
    channel: 'AI / B2B Automation Channel',
    episode_id: '001',
    topic: 'Define AI automation channel concept and offer map',
    status: 'planned',
    owner: 'AI/B2B Systems Lead',
    script_path: '',
    video_path: '',
    captions_path: '',
    thumbnail_path: '',
    upload_status: 'not-started',
    publish_target: '2026-08-07',
    blocker: 'Do not launch until tested workflows exist',
    priority: 50
  });

  writeJson(PORTFOLIO_CALENDAR, items);
  return items;
}

function detectBlockers(dependencyRules) {
  const blockers = [];
  const add = (severity, item) => blockers.push({ severity, item });
  if (!fileExists('docs/saints_episodes/001_saint_seraphim_of_sarov_research_brief.md')) add('P1', 'Missing Saint Seraphim research brief.');
  if (!fileExists('docs/saints_episodes/001_saint_seraphim_of_sarov_episode_outline.md')) add('P1', 'Missing Saint Seraphim episode outline.');
  if (!fileExists('saints_channel_config.json')) add('P1', 'Missing The Saints channel config.');
  if (!fileExists('docs/channel_portfolio_gantt_schedule.md')) add('P1', 'Missing portfolio Gantt schedule.');
  if (!fileExists('automation/credentials/oauth_tokens.json')) add('P1', 'YouTube OAuth tokens are missing locally.');
  if (!fileExists('docs/agents/agent_registry.md')) add('P2', 'Missing agent registry.');
  for (const rule of dependencyRules.filter(rule => rule.status === 'open')) {
    add(rule.severity, rule.rule);
  }
  return blockers;
}

function buildRaid(classified, production, blockers, sensitiveFiles, dependencyRules) {
  const risks = [];
  const assumptions = [];
  const issues = [];
  const dependencies = [];
  if (classified.overdue.length) issues.push(`${classified.overdue.length} schedule task(s) are overdue.`);
  if (sensitiveFiles.length) risks.push('Private YouTube tracker/status files have local changes and must not be pushed automatically.');
  for (const item of production) {
    if (String(item.blocker || '').toLowerCase().includes('placeholder')) risks.push('Some Corporate Shadows videos may still rely on placeholder visuals.');
    if (String(item.blocker || '').toLowerCase().includes('public publishing')) risks.push('Public publishing remains approval-gated.');
  }
  blockers.forEach(blocker => issues.push(`${blocker.severity}: ${blocker.item}`));
  assumptions.push('Corporate Shadows remains the active/live channel until The Saints channel is created.');
  assumptions.push('The Saints will be a separate channel, not uploaded through Corporate Shadows.');
  assumptions.push('AI/B2B automation content must be based on tested workflows, not generic AI news.');
  dependencyRules.forEach(rule => dependencies.push(`${rule.severity}: ${rule.rule}`));
  return { risks: [...new Set(risks)], assumptions, issues, dependencies };
}

function getRagStatus(classified, blockers, sensitiveFiles) {
  if (classified.overdue.length > 2 || blockers.some(blocker => blocker.severity === 'P0' || blocker.severity === 'P1')) return 'RED';
  if (classified.overdue.length || blockers.length || sensitiveFiles.length) return 'AMBER';
  return 'GREEN';
}

function buildDecisionLog(classified, production) {
  const decisions = [];
  if (production.some(item => String(item.blocker || '').includes('Public publishing'))) decisions.push('Public release approval is still required before any scheduled/public upload goes live.');
  if (classified.upcoming.some(task => task.name.includes('Create actual Saints YouTube channel'))) decisions.push('The Saints channel/Brand Account needs to be created before the first private draft upload target.');
  decisions.push('Decide whether Corporate Shadows visuals must be replaced before publishing videos 4-5 publicly.');
  decisions.push('Decide whether AI/B2B channel launch remains August 7 or moves earlier/later after pilot review.');
  return decisions;
}

function estimateCapacity(tasks, capacityPlan) {
  const activeByLane = {};
  for (const task of tasks.filter(task => inferTaskState(task) === 'active')) {
    activeByLane[task.section] = (activeByLane[task.section] || 0) + 1;
  }
  return capacityPlan.lanes.map(lane => ({
    channel: lane.channel,
    weekly_capacity_units: lane.weekly_capacity_units,
    active_task_count: activeByLane[lane.channel] || 0,
    cadence_goal: lane.cadence_goal,
    load_status: (activeByLane[lane.channel] || 0) > lane.weekly_capacity_units ? 'overloaded' : 'ok'
  }));
}

function buildKpis(tasks, classified, production, queue, blockers) {
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
    replacementEntries: queue.replacements,
    p1Blockers: blockers.filter(blocker => blocker.severity === 'P1').length,
    p2Blockers: blockers.filter(blocker => blocker.severity === 'P2').length
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

function htmlEscape(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function writeDashboard(context) {
  const { rag, kpis, classified, blockers, capacity, calendar } = context;
  const rows = calendar.slice(0, 30).map(item => `<tr><td>${htmlEscape(item.channel)}</td><td>${htmlEscape(item.topic)}</td><td>${htmlEscape(item.status)}</td><td>${htmlEscape(item.owner)}</td><td>${htmlEscape(item.blocker)}</td></tr>`).join('\n');
  const blockerRows = blockers.map(item => `<tr><td>${item.severity}</td><td>${htmlEscape(item.item)}</td></tr>`).join('\n') || '<tr><td colspan="2">None</td></tr>';
  const capacityRows = capacity.map(item => `<tr><td>${htmlEscape(item.channel)}</td><td>${item.weekly_capacity_units}</td><td>${item.active_task_count}</td><td>${htmlEscape(item.load_status)}</td><td>${htmlEscape(item.cadence_goal)}</td></tr>`).join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>PM Dashboard</title><style>body{font-family:Arial,sans-serif;margin:24px;background:#f6f7f4;color:#17212b}section{background:#fff;border:1px solid #d9ded8;border-radius:8px;padding:18px;margin:16px 0}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #d9ded8;padding:8px;text-align:left;vertical-align:top}th{background:#10202b;color:#fff}.rag{font-size:28px;font-weight:bold}.RED{color:#b91c1c}.AMBER{color:#b7791f}.GREEN{color:#15803d}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{background:#eef3f5;border-radius:8px;padding:12px}</style></head><body><h1>Portfolio PM Dashboard</h1><p>Generated ${new Date().toLocaleString()}</p><section><div class="rag ${rag}">${rag}</div><div class="grid"><div class="card">Completion<br><strong>${kpis.taskCompletion}%</strong></div><div class="card">Active Tasks<br><strong>${kpis.activeTasks}</strong></div><div class="card">Overdue<br><strong>${kpis.overdueTasks}</strong></div><div class="card">P1 Blockers<br><strong>${kpis.p1Blockers}</strong></div></div></section><section><h2>Blockers</h2><table><tr><th>Severity</th><th>Blocker</th></tr>${blockerRows}</table></section><section><h2>Capacity</h2><table><tr><th>Channel</th><th>Weekly Units</th><th>Active Tasks</th><th>Load</th><th>Cadence</th></tr>${capacityRows}</table></section><section><h2>Active Tasks</h2><ul>${classified.active.map(task => `<li>${htmlEscape(task.section)}: ${htmlEscape(task.name)} (${formatDate(task.start)}-${formatDate(task.end)})</li>`).join('') || '<li>None</li>'}</ul></section><section><h2>Portfolio Content Calendar</h2><table><tr><th>Channel</th><th>Topic</th><th>Status</th><th>Owner</th><th>Blocker</th></tr>${rows}</table></section></body></html>`;
  fs.writeFileSync(file(DASHBOARD_FILE), html);
}

function buildReport() {
  const tasks = extractMermaidTasks();
  const gateStatus = readJson('metadata/channel_gate_status.json', null);
  const classified = classifyTasks(tasks);
  const gitStatus = parseGitStatus();
  const production = summarizeProductionStatus();
  const queue = summarizeQueue();
  const dependencyRules = ensureDependencyRules();
  const capacityPlan = ensureCapacityPlan();
  const calendar = inferContentCalendar();
  const blockers = detectBlockers(dependencyRules);
  const changedFiles = gitStatus.ok ? gitStatus.files : [];
  const sensitiveFiles = changedFiles.filter(item => isSensitive(item.file));
  const safeFiles = changedFiles.filter(item => !isSensitive(item.file));
  const raid = buildRaid(classified, production, blockers, sensitiveFiles, dependencyRules);
  const rag = getRagStatus(classified, blockers, sensitiveFiles);
  const decisions = buildDecisionLog(classified, production);
  const kpis = buildKpis(tasks, classified, production, queue, blockers);
  const capacity = estimateCapacity(tasks, capacityPlan);

  writeDashboard({ rag, kpis, classified, blockers, capacity, calendar });

  const activeRows = classified.active.map(task => ({ Lane: task.section, Task: task.name, Owner: task.owner, Start: formatDate(task.start), End: formatDate(task.end), Status: inferTaskState(task) }));
  const upcomingRows = classified.upcoming.map(task => ({ Lane: task.section, Task: task.name, Owner: task.owner, Start: formatDate(task.start), End: formatDate(task.end) }));
  const overdueRows = classified.overdue.map(task => ({ Lane: task.section, Task: task.name, Owner: task.owner, Ended: formatDate(task.end) }));
  const blockerRows = blockers.map(blocker => ({ Severity: blocker.severity, Blocker: blocker.item }));
  const capacityRows = capacity.map(item => ({ Channel: item.channel, Capacity: item.weekly_capacity_units, Active: item.active_task_count, Load: item.load_status, Cadence: item.cadence_goal }));
  const calendarRows = calendar.slice(0, 15).map(item => ({ Channel: item.channel, Topic: item.topic, Status: item.status, Owner: item.owner, Blocker: item.blocker || 'none' }));

  const gateSummary = gateStatus
    ? ` Corporate Shadows upgraded videos: ${gateStatus.corporate_shadows.upgraded_public_videos} public, ${gateStatus.corporate_shadows.scheduled_upgraded_videos} scheduled. Saints gate: ${gateStatus.saints_gate.status}; research-only until ${gateStatus.saints_gate.required_public_corporate_videos} Corporate Shadows videos are public. Gate clock starts ${gateStatus.saints_gate.clock_starts_on.slice(0, 10)}.`
    : '';
  const stakeholderSummary = `Status: ${rag}. Active tasks: ${kpis.activeTasks}. Overdue: ${kpis.overdueTasks}. P1 blockers: ${kpis.p1Blockers}.${gateSummary} Main focus is Corporate Shadows visual sourcing and schedule integrity. Sensitive YouTube tracker/status files remain local and are excluded from auto-push.`;

  const report = `# PM Agent Portfolio Report\n\n` +
    `Generated: ${new Date().toISOString()}\n\n` +
    `Schedule date basis: ${formatDate(TODAY)}\n\n` +
    `## Report To Vlad\n\n${stakeholderSummary}\n\n` +
    `## Executive Dashboard\n\n` +
    `- Overall RAG status: **${rag}**\n- Schedule completion: ${kpis.taskCompletion}%\n- Active schedule tasks: ${kpis.activeTasks}\n- Overdue schedule tasks: ${kpis.overdueTasks}\n- Upcoming tasks in next 7 days: ${kpis.upcomingTasks}\n- P1 blockers: ${kpis.p1Blockers}\n- P2 blockers: ${kpis.p2Blockers}\n- Production records: ${kpis.productionRecords}\n- Blocked production records: ${kpis.blockedProduction}\n- Upload queue entries: ${kpis.queueEntries}\n- Replacement queue entries: ${kpis.replacementEntries}\n\n` +
    `## PM Capabilities Added\n\n- Auto-generated portfolio content calendar\n- Blocker severity P0/P1/P2/P3\n- Dependency rules\n- Capacity planning\n- Task state inference\n- HTML PM dashboard\n- Safe git automation controls\n- Stakeholder brief for Vlad\n\n` +
    `## Active Tasks\n\n${table(activeRows, ['Lane', 'Task', 'Owner', 'Start', 'End', 'Status'])}\n\n` +
    `## Overdue Tasks\n\n${table(overdueRows, ['Lane', 'Task', 'Owner', 'Ended'])}\n\n` +
    `## Upcoming Tasks\n\n${table(upcomingRows, ['Lane', 'Task', 'Owner', 'Start', 'End'])}\n\n` +
    `## Capacity Plan\n\n${table(capacityRows, ['Channel', 'Capacity', 'Active', 'Load', 'Cadence'])}\n\n` +
    `## Portfolio Content Calendar Preview\n\n${table(calendarRows, ['Channel', 'Topic', 'Status', 'Owner', 'Blocker'])}\n\n` +
    `## Blockers By Severity\n\n${table(blockerRows, ['Severity', 'Blocker'])}\n\n` +
    `## Production Records\n\n${markdownList(production, item => `- ${item.video_id}: ${item.stage}; next: ${item.next}; blocker: [${item.severity}] ${item.blocker || 'none'}`)}\n\n` +
    `## RAID Log\n\n### Risks\n${markdownList(raid.risks, item => `- ${item}`)}\n\n### Assumptions\n${markdownList(raid.assumptions, item => `- ${item}`)}\n\n### Issues\n${markdownList(raid.issues, item => `- ${item}`)}\n\n### Dependencies\n${markdownList(raid.dependencies, item => `- ${item}`)}\n\n` +
    `## Decisions Needed\n\n${markdownList(decisions, item => `- ${item}`)}\n\n` +
    `## Channel Gate Status\n\n${gateStatus ? `- Corporate Shadows upgraded public videos: ${gateStatus.corporate_shadows.upgraded_public_videos}\n- Corporate Shadows upgraded scheduled videos: ${gateStatus.corporate_shadows.scheduled_upgraded_videos}\n- Saints gate: ${gateStatus.saints_gate.status}\n- Saints allowed work: ${gateStatus.saints_gate.allowed_work}\n- Gate clock starts: ${gateStatus.saints_gate.clock_starts_on}\n- Earliest gate review: ${gateStatus.saints_gate.earliest_gate_review}` : '- No gate status file found.'}\n\n` +
    `## Queue Summary\n\n- Total entries: ${queue.total}\n- Scheduled status entries: ${queue.scheduled}\n- Replacement entries: ${queue.replacements}\n- Human approval entries: ${queue.humanApproval}\n\n` +
    `## Git Safety Review\n\n${gitStatus.ok ? '' : `Git status failed: ${gitStatus.error}\n\n`}Safe changed files:\n${markdownList(safeFiles, item => `- ${item.status.trim() || 'M'} ${item.file}`)}\n\nSensitive/local changed files, do not auto-push:\n${markdownList(sensitiveFiles, item => `- ${item.status.trim() || 'M'} ${item.file}`)}\n\n` +
    `## Recommended Next Actions\n\n1. Keep The Saints research-only until the Corporate Shadows public-video gate is met.\n2. Continue Corporate Shadows Video 3 sourcing sprint.\n3. Keep private YouTube tracker/status files local unless explicitly approved for disclosure.\n4. Start AI/B2B concept and offer map on 2026-06-10.\n5. Review ${DASHBOARD_FILE} for a browser dashboard.\n`;

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
  const files = safeFiles.map(item => item.file).filter(name => !name.startsWith('metadata/pm_reports/') && !isSensitive(name));
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
  console.log(`PM dashboard written: ${DASHBOARD_FILE}`);
  if (SHOULD_COMMIT) {
    const commit = commitSafeFiles(safeFiles);
    console.log(`\nCommit safe files: ${commit.message}`);
    if (SHOULD_PUSH && commit.committed) console.log(`Push safe commit: ${pushSafeCommit().message}`);
  }
  if (sensitiveFiles.length) console.log('\nSensitive files remain local and were not committed automatically.');
}

if (require.main === module) main();


