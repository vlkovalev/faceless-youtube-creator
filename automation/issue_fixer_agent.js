'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const {
  REPO_ROOT,
  SAAS_AUTOMATION_ROOT
} = require('./channel_paths');

const ROOT = REPO_ROOT;
const AUTOMATION_DIR = __dirname;
const META_DIR = path.join(ROOT, 'metadata');
const ISSUES_FILE = path.join(META_DIR, 'youtube_health_check_issues.json');
const REPORT_JSON = path.join(META_DIR, 'issue_fixer_report.json');
const REPORT_MD = path.join(META_DIR, 'issue_fixer_report.md');
const STATE_JSON = path.join(META_DIR, 'issue_fixer_state.json');

const args = parseArgs(process.argv.slice(2));
const DRY_RUN = toBool(args['dry-run']);
const WATCH = toBool(args.watch);
const FORCE = toBool(args.force);
const SKIP_HEALTH_CHECK = toBool(args['skip-health-check']);
const CHANNEL_FILTER = normalizeChannelKey(args.channel || '');
const INTERVAL_SECONDS = Math.max(60, Number.parseInt(args['interval-seconds'], 10) || 300);

const CHANNEL_NAMES = {
  corporate: 'Corporate Shadows',
  saints: 'The Saints',
  saas_autopilot: 'SaaS Autopilot'
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    if (rest.length) {
      out[key] = rest.join('=');
      continue;
    }
    const next = argv[i + 1];
    out[key] = next && !next.startsWith('--') ? argv[++i] : true;
  }
  return out;
}

function toBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeChannelKey(value) {
  const normalized = String(value || '').toLowerCase().replace(/[-\s]+/g, '_');
  if (!normalized) return '';
  if (['cs', 'corporate', 'corporate_shadows'].includes(normalized)) return 'corporate';
  if (['saints', 'the_saints'].includes(normalized)) return 'saints';
  if (['saas', 'saas_autopilot', 'saasautomation', 'saas_automation', 'saasautopilot'].includes(normalized)) {
    return 'saas_autopilot';
  }
  return normalized;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function stableIssueKey(issue) {
  return [
    normalizeChannelKey(issue.channel_key),
    String(issue.code || ''),
    String(issue.summary || ''),
    String(issue.details || '')
  ].join('|');
}

function issueSignature(issues) {
  const list = (Array.isArray(issues) ? issues : [])
    .map(stableIssueKey)
    .sort();
  return crypto.createHash('sha1').update(JSON.stringify(list)).digest('hex');
}

function uniqueIssues(issues) {
  const seen = new Set();
  const out = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    const key = stableIssueKey(issue);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

function runNodeScript(scriptPath, scriptArgs = [], cwd = ROOT) {
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
    windowsHide: true,
    env: { ...process.env }
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function gateAction(action, channel) {
  const result = runNodeScript(path.join(AUTOMATION_DIR, 'approval_gate_agent.js'), [
    `--action=${action}`,
    `--channel=${channel}`,
    '--mode=always_allow_low_risk'
  ]);

  let decision = null;
  try {
    decision = JSON.parse((result.stdout || '').trim() || '{}');
  } catch {
    decision = null;
  }

  return {
    ok: result.status === 0 || result.status === 1 || result.status === 2,
    decision: decision && decision.decision ? decision.decision : 'require_approval',
    reason: decision && decision.reason ? decision.reason : 'No approval decision returned.'
  };
}

function refreshHealth(channel) {
  if (SKIP_HEALTH_CHECK) return { ok: true, skipped: true };
  const script = path.join(AUTOMATION_DIR, 'youtube_health_check_agent.js');
  const scriptArgs = channel ? [`--channel=${channel}`] : [];
  return runNodeScript(script, scriptArgs, ROOT);
}

function loadIssues() {
  const issues = readJson(ISSUES_FILE, []);
  const filtered = CHANNEL_FILTER
    ? issues.filter(issue => normalizeChannelKey(issue.channel_key) === CHANNEL_FILTER)
    : issues;
  return uniqueIssues(filtered);
}

function statusSyncAction(channel) {
  return {
    id: `status-sync:${channel}`,
    channel,
    action: 'youtube status sync',
    label: `Refresh ${CHANNEL_NAMES[channel] || channel} live status snapshot`,
    cwd: ROOT,
    script: path.join(AUTOMATION_DIR, 'youtube_status_agent.js'),
    args: [`--channel=${channel}`]
  };
}

function calendarSyncAction() {
  return {
    id: 'calendar-sync',
    channel: 'shared',
    action: 'status sync calendar reconcile',
    label: 'Reconcile local calendars against live YouTube schedule state',
    cwd: ROOT,
    script: path.join(AUTOMATION_DIR, 'sync_calendar_with_live.js'),
    args: []
  };
}

function corporatePmAction() {
  return {
    id: 'corporate-pm-push-safe',
    channel: 'corporate',
    action: 'pm report queue refresh',
    label: 'Run Corporate Shadows PM push-safe report',
    cwd: path.join(ROOT, 'Corporate Shadows'),
    script: path.join(ROOT, 'Corporate Shadows', 'automation', 'pm_agent.js'),
    args: ['--push-safe']
  };
}

function saintsPmAction() {
  return {
    id: 'saints-pm-push',
    channel: 'saints',
    action: 'pm report queue refresh',
    label: 'Run The Saints PM push report',
    cwd: ROOT,
    script: path.join(AUTOMATION_DIR, 'saints_pm_push_agent.js'),
    args: []
  };
}

function saasQaAction() {
  return {
    id: 'saas-qc-dry-run',
    channel: 'saas_autopilot',
    action: 'qc dry-run schedule scan',
    label: 'Run SaaS Autopilot full-cycle QA/QC dry-run',
    cwd: SAAS_AUTOMATION_ROOT,
    script: path.join(SAAS_AUTOMATION_ROOT, 'automation', 'saas_autopilot_full_cycle_qaqc_agent.js'),
    args: ['--dry-run']
  };
}

function saasSchedulerAction() {
  return {
    id: 'saas-scheduler-dry-run',
    channel: 'saas_autopilot',
    action: 'dry-run backlog scheduler scan',
    label: 'Run SaaS Autopilot scheduler dry-run',
    cwd: SAAS_AUTOMATION_ROOT,
    script: path.join(SAAS_AUTOMATION_ROOT, 'automation', 'saas_autopilot_channel_scheduler.js'),
    args: ['--dry-run']
  };
}

function followupActions(channel, mode) {
  if (channel === 'corporate') return [corporatePmAction()];
  if (channel === 'saints') return [saintsPmAction()];
  if (channel === 'saas_autopilot') {
    return mode === 'coverage' ? [saasSchedulerAction(), saasQaAction()] : [saasQaAction()];
  }
  return [];
}

function buildFixPlan(issue) {
  const channel = normalizeChannelKey(issue.channel_key);
  const code = String(issue.code || '').toLowerCase();
  if (!channel) return [];

  switch (code) {
    case 'missing_status_file':
    case 'stale_status_snapshot':
      return [statusSyncAction(channel)];
    case 'missing_tracker_entries':
    case 'missing_youtube_id':
    case 'tracker_not_in_live_status':
      return [statusSyncAction(channel), calendarSyncAction(), ...followupActions(channel, 'reconcile')];
    case 'publish_delay_detected':
    case 'scheduled_video_not_public':
      return [statusSyncAction(channel), calendarSyncAction(), ...followupActions(channel, 'schedule')];
    case 'no_future_scheduled_videos':
    case 'thin_schedule_coverage':
      return [...followupActions(channel, 'coverage')];
    default:
      return [statusSyncAction(channel)];
  }
}

function executeAction(action, cache) {
  if (cache.has(action.id)) return cache.get(action.id);

  const gate = gateAction(action.action, action.channel);
  const record = {
    id: action.id,
    channel: action.channel,
    label: action.label,
    action: action.action,
    script: rel(action.script),
    args: action.args,
    cwd: rel(action.cwd),
    approval: {
      decision: gate.decision,
      reason: gate.reason
    },
    dry_run: DRY_RUN
  };

  if (gate.decision !== 'allow') {
    record.ok = false;
    record.skipped = true;
    record.skip_reason = `Approval gate returned ${gate.decision}.`;
    cache.set(action.id, record);
    return record;
  }

  if (DRY_RUN) {
    record.ok = true;
    record.skipped = true;
    record.skip_reason = 'Dry-run mode enabled.';
    cache.set(action.id, record);
    return record;
  }

  const result = runNodeScript(action.script, action.args, action.cwd);
  record.ok = result.ok;
  record.exit_code = result.status;
  record.stdout_tail = result.stdout.trim().split(/\r?\n/).filter(Boolean).slice(-20);
  record.stderr_tail = result.stderr.trim().split(/\r?\n/).filter(Boolean).slice(-20);
  cache.set(action.id, record);
  return record;
}

function summarizeStatus(preIssues, postIssues, attempts) {
  const before = new Set(preIssues.map(stableIssueKey));
  const after = new Set(postIssues.map(stableIssueKey));
  const resolved = preIssues.filter(issue => !after.has(stableIssueKey(issue)));
  const unresolved = preIssues.filter(issue => after.has(stableIssueKey(issue)));
  const newIssues = postIssues.filter(issue => !before.has(stableIssueKey(issue)));
  const executed = attempts.filter(item => !item.skipped);
  const failedActions = executed.filter(item => !item.ok);

  let status = 'healthy';
  if (postIssues.length && resolved.length) status = 'partial';
  if (postIssues.length && !resolved.length) status = 'unresolved';
  if (!preIssues.length) status = 'healthy';
  if (!preIssues.length && postIssues.length) status = 'detected';
  if (failedActions.length) status = 'action_failures';

  return { status, resolved, unresolved, newIssues };
}

function buildMarkdown(report) {
  const lines = [
    '# Issue Fixer Report',
    '',
    `Generated: ${report.generated_at}`,
    `Mode: ${report.watch_mode ? 'watch' : 'single-run'}`,
    `Dry Run: ${report.dry_run ? 'yes' : 'no'}`,
    `Status: ${report.status}`,
    `Issues Seen: ${report.issues_seen}`,
    `Resolved: ${report.resolved.length}`,
    `Unresolved: ${report.unresolved.length}`,
    `New Issues After Fix Pass: ${report.new_issues.length}`,
    ''
  ];

  lines.push('## Attempted Fixes');
  if (!report.attempted_fixes.length) {
    lines.push('- No fix actions were attempted.');
  } else {
    for (const item of report.attempted_fixes) {
      const outcome = item.skipped ? `skipped (${item.skip_reason})` : item.ok ? 'ok' : `failed (exit ${item.exit_code})`;
      lines.push(`- [${item.channel}] ${item.label} -> ${outcome}`);
    }
  }

  lines.push('', '## Resolved Issues');
  if (!report.resolved.length) {
    lines.push('- None.');
  } else {
    for (const issue of report.resolved) {
      lines.push(`- [${issue.channel_name}] ${issue.code}: ${issue.summary}`);
    }
  }

  lines.push('', '## Unresolved Issues');
  if (!report.unresolved.length) {
    lines.push('- None.');
  } else {
    for (const issue of report.unresolved) {
      lines.push(`- [${issue.channel_name}] ${issue.code}: ${issue.summary}`);
    }
  }

  if (report.new_issues.length) {
    lines.push('', '## New Issues After Fix Pass');
    for (const issue of report.new_issues) {
      lines.push(`- [${issue.channel_name}] ${issue.code}: ${issue.summary}`);
    }
  }

  return lines.join('\n');
}

function loadState() {
  return readJson(STATE_JSON, {
    last_issue_signature: null,
    last_run_at: null,
    last_status: null
  });
}

function saveState(state) {
  writeJson(STATE_JSON, state);
}

function issueChannelName(issue) {
  return issue.channel_name || CHANNEL_NAMES[normalizeChannelKey(issue.channel_key)] || issue.channel_key || 'unknown';
}

function buildNoIssueReport() {
  return {
    generated_at: new Date().toISOString(),
    watch_mode: WATCH,
    dry_run: DRY_RUN,
    channel_filter: CHANNEL_FILTER || null,
    status: 'healthy',
    issues_seen: 0,
    attempted_fixes: [],
    resolved: [],
    unresolved: [],
    new_issues: []
  };
}

function logIssueSummary(issues) {
  if (!issues.length) {
    console.log('[issue-fixer] No active issues detected.');
    return;
  }
  console.log(`[issue-fixer] Active issues detected: ${issues.length}`);
  for (const issue of issues) {
    console.log(`[issue-fixer] ${issueChannelName(issue)} | ${issue.code} | ${issue.summary}`);
  }
}

async function runCycle() {
  const state = loadState();
  const healthResult = refreshHealth(CHANNEL_FILTER);
  if (!healthResult.ok && !healthResult.skipped) {
    console.warn('[issue-fixer] Health check returned non-zero status; continuing with the latest issue file.');
  }

  const preIssues = loadIssues();
  const signature = issueSignature(preIssues);
  logIssueSummary(preIssues);

  if (!preIssues.length) {
    const report = buildNoIssueReport();
    writeJson(REPORT_JSON, report);
    writeText(REPORT_MD, buildMarkdown(report));
    saveState({
      last_issue_signature: null,
      last_run_at: report.generated_at,
      last_status: report.status
    });
    return report;
  }

  if (!FORCE && state.last_issue_signature && state.last_issue_signature === signature) {
    const report = {
      generated_at: new Date().toISOString(),
      watch_mode: WATCH,
      dry_run: DRY_RUN,
      channel_filter: CHANNEL_FILTER || null,
      status: 'duplicate_open_issue_set',
      issues_seen: preIssues.length,
      attempted_fixes: [],
      resolved: [],
      unresolved: preIssues,
      new_issues: []
    };
    writeJson(REPORT_JSON, report);
    writeText(REPORT_MD, buildMarkdown(report));
    saveState({
      last_issue_signature: signature,
      last_run_at: report.generated_at,
      last_status: report.status
    });
    console.log('[issue-fixer] Issue set unchanged since the last repair pass. Skipping duplicate actions.');
    return report;
  }

  const actionCache = new Map();
  const attempted = [];

  for (const issue of preIssues) {
    const actions = buildFixPlan(issue);
    for (const action of actions) {
      console.log(`[issue-fixer] ${issueChannelName(issue)} -> ${action.label}`);
      attempted.push(executeAction(action, actionCache));
    }
  }

  const postHealthResult = refreshHealth(CHANNEL_FILTER);
  if (!postHealthResult.ok && !postHealthResult.skipped) {
    console.warn('[issue-fixer] Post-fix health check returned non-zero status; using the latest available issue file.');
  }

  const postIssues = loadIssues();
  const summary = summarizeStatus(preIssues, postIssues, attempted);
  const report = {
    generated_at: new Date().toISOString(),
    watch_mode: WATCH,
    dry_run: DRY_RUN,
    channel_filter: CHANNEL_FILTER || null,
    status: summary.status,
    issues_seen: preIssues.length,
    attempted_fixes: Array.from(new Map(attempted.map(item => [item.id, item])).values()),
    resolved: summary.resolved,
    unresolved: summary.unresolved,
    new_issues: summary.newIssues,
    health_check: {
      pre_fix_ok: healthResult.ok || healthResult.skipped,
      post_fix_ok: postHealthResult.ok || postHealthResult.skipped
    }
  };

  writeJson(REPORT_JSON, report);
  writeText(REPORT_MD, buildMarkdown(report));
  saveState({
    last_issue_signature: postIssues.length ? issueSignature(postIssues) : null,
    last_run_at: report.generated_at,
    last_status: report.status
  });

  console.log(JSON.stringify({
    generated_at: report.generated_at,
    status: report.status,
    issues_seen: report.issues_seen,
    resolved: report.resolved.length,
    unresolved: report.unresolved.length,
    new_issues: report.new_issues.length,
    report_json: rel(REPORT_JSON),
    report_md: rel(REPORT_MD)
  }, null, 2));

  return report;
}

async function main() {
  if (!WATCH) {
    const report = await runCycle();
    process.exitCode = report.unresolved.length || report.new_issues.length ? 1 : 0;
    return;
  }

  console.log(`[issue-fixer] Watch mode enabled. Polling every ${INTERVAL_SECONDS} seconds.`);
  for (;;) {
    try {
      await runCycle();
    } catch (error) {
      console.error('[issue-fixer] Fatal cycle failure:', error);
    }
    await sleep(INTERVAL_SECONDS * 1000);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('[issue-fixer] Unhandled failure:', error);
    process.exit(1);
  });
}
