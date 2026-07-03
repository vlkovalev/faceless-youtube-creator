'use strict';

require('dotenv').config({ path: require('path').join(__dirname, 'credentials', '.env') });

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const META_DIR = path.join(ROOT, 'metadata');
const REPORT_DIR = path.join(META_DIR, 'full_cycle_reports');
const LATEST_REPORT_FILE = path.join(META_DIR, 'full_cycle_latest.json');
const LATEST_REPORT_MD = path.join(META_DIR, 'full_cycle_latest.md');

const args = parseArgs(process.argv.slice(2));
const RAW_CHANNEL = String(args.channel || '').toLowerCase();
const CHANNEL = ['saas_autopilot', 'saasautopilot', 'saas_automation', 'saasautomation', 'saas', 'saas_autopilot', 'saas_autopilot'].includes(RAW_CHANNEL)
  ? 'saas_autopilot'
  : RAW_CHANNEL;
const TOPIC_ID = args['topic-id'] || args.topic || args.id;
const START_STAGE = String(args.stage || 'write').toLowerCase();
const DRY_RUN = flagEnabled(args['dry-run']);
const MAX_RETRIES = Number(args['max-retries'] || 2);
const USER_PUBLISH_AT = args['publish-at'] || null;

const STAGES = ['write', 'plan', 'tts', 'assets', 'edit', 'qc', 'upload', 'status_sync', 'delay_check'];

const CHANNEL_CONFIG = {
  cs: {
    name: 'Corporate Shadows',
    statusChannel: 'cs',
    trackerFile: path.join(ROOT, 'Corporate Shadows', 'metadata', 'uploads_tracker.json'),
    delayReportFile: null,
    planAgent: 'visual_asset_planner.js',
    planArgs: id => ['--video', String(id)],
    ttsAgent: 'generate_assets.js',
    ttsArgs: id => [String(id)],
    assetsAgent: 'generate_assets.js',
    assetsArgs: id => [String(id)],
    editAgent: 'editor_beat_agent.js',
    editArgs: id => [String(id)],
    qcAgent: 'qc_agent.js',
    qcArgs: id => [String(id)],
    uploadAgent: 'uploader_agent.js',
    uploadArgs: (id, publishAt) => [
      '--only', `FINAL_VIDEO_${id}_VISUAL_UPGRADE.mp4`,
      '--auto-approve-scheduled',
      ...(publishAt ? ['--publish-at', publishAt] : [])
    ]
  },
  saints: {
    name: 'The Saints',
    statusChannel: 'saints',
    trackerFile: path.join(ROOT, 'The Saints', 'metadata', 'uploads_tracker.json'),
    delayReportFile: null,
    planAgent: 'saints_visual_asset_planner.js',
    planArgs: id => [String(id)],
    ttsAgent: 'saints_generate_assets.js',
    ttsArgs: id => [String(id)],
    assetsAgent: 'saints_generate_assets.js',
    assetsArgs: id => [String(id)],
    editAgent: 'saints_editor_agent.js',
    editArgs: id => [String(id)],
    qcAgent: 'qc_agent.js',
    qcArgs: id => ['--channel', 'saints', '--script', String(id)],
    uploadAgent: 'uploader_agent.js',
    uploadArgs: (id, publishAt) => [
      '--only', `SAINTS_VIDEO_${id}_FINAL.mp4`,
      '--channel', 'saints',
      '--auto-approve-scheduled',
      ...(publishAt ? ['--publish-at', publishAt] : [])
    ]
  },
  saas_autopilot: {
    name: 'SaaS Autopilot',
    statusChannel: 'saas_autopilot',
    trackerFile: path.join(ROOT, 'SaaS Autopilot', 'metadata', 'uploads_tracker.json'),
    delayReportFile: path.join(ROOT, 'SaaS Autopilot', 'metadata', 'publish_delay_report.json'),
    planAgent: null,
    planArgs: () => [],
    ttsAgent: 'saas_autopilot_tts_agent.js',
    ttsArgs: id => ['--topic', id],
    assetsAgent: null,
    assetsArgs: () => [],
    editAgent: 'saas_autopilot_editor_agent.js',
    editArgs: id => ['--topic', id],
    qcAgent: 'qc_agent.js',
    qcArgs: id => ['--channel', 'saas_autopilot', '--topic', id],
    uploadAgent: 'saas_autopilot_publisher_agent.js',
    uploadArgs: (id, publishAt) => [
      '--topic', id,
      ...(publishAt ? ['--publish-at', publishAt] : [])
    ]
  }
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    if (rest.length) {
      out[key] = rest.join('=');
    } else {
      const next = argv[i + 1];
      out[key] = next && !next.startsWith('--') ? argv[++i] : true;
    }
  }
  return out;
}

function flagEnabled(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function tail(text, max = 1800) {
  const value = String(text || '');
  return value.length > max ? value.slice(value.length - max) : value;
}

function runNodeScript(scriptName, scriptArgs = [], inherit = false) {
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName), ...scriptArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
    shell: false,
    windowsHide: true,
    env: { ...process.env }
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || '')
  };
}

function nextAvailableSlot(channel) {
  const slate = readJson(path.join(META_DIR, 'canonical_slate.json'), {});
  const channelSlots = Array.isArray(slate[channel]) ? slate[channel] : [];
  const occupied = new Set(channelSlots.filter(entry => entry && entry.canonical && entry.slot).map(entry => String(entry.slot)));
  const cadenceDays = channel === 'saas_autopilot' ? [3, 6] : [2, 5];
  const candidate = new Date();
  candidate.setUTCHours(6, 0, 0, 0);

  for (let i = 0; i < 120; i++) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    if (!cadenceDays.includes(candidate.getUTCDay())) continue;
    const iso = candidate.toISOString().slice(0, 19) + '.000Z';
    if (!occupied.has(iso)) return iso;
  }

  return null;
}

function classifyFailure(stage, run) {
  const combined = `${run.stdout}\n${run.stderr}`;
  if (stage === 'upload' && /canonical slate blocked|already has canonical entry/i.test(combined)) return 'slot_conflict';
  if (/missing youtube oauth credentials|oauth|token refresh failed|authorization code|missing.*oauth/i.test(combined)) return 'auth_issue';
  if (stage === 'qc' && /failed|blocked/i.test(combined)) return 'qc_failure';
  if (stage === 'status_sync' && /failed|missing/i.test(combined)) return 'status_sync_failure';
  return 'generic_failure';
}

function checkApproval(channel, stage, publishAt) {
  const action = stage === 'upload'
    ? `scheduled upload channel=${channel} publish_at=${publishAt || 'none'}`
    : `${stage} automation channel=${channel}`;
  const result = runNodeScript('approval_gate_agent.js', [`--channel=${channel}`, `--action=${action}`, '--mode=always_allow_low_risk']);
  const decision = readJson(path.join(META_DIR, 'approval_gate_last_decision.json'), {
    decision: result.ok ? 'allow' : 'require_approval',
    reason: 'No approval decision file found.'
  });
  return decision;
}

function trackerSummary(channelCfg) {
  const tracker = readJson(channelCfg.trackerFile, { uploaded_files: {} });
  const uploadedFiles = tracker && tracker.uploaded_files ? tracker.uploaded_files : {};
  const channelEntries = Object.entries(uploadedFiles).filter(([, value]) => {
    if (channelCfg.statusChannel === 'saas_autopilot') return String(value.channel || '').toLowerCase() === 'saas_autopilot';
    if (channelCfg.statusChannel === 'saints') return String(value.channel || '').toLowerCase() === 'the_saints';
    return String(value.channel || '').toLowerCase() === 'corporate_shadows' || !value.channel;
  });
  return {
    total_entries: channelEntries.length,
    uploaded_files: channelEntries.map(([filename, value]) => ({
      filename,
      youtube_id: value.youtube_id || '',
      publish_at: value.publish_at || '',
      status_note: value.status_note || ''
    }))
  };
}

function issueRecord(stage, run, type, retryable = true) {
  return {
    stage,
    type,
    retryable,
    detected_at: new Date().toISOString(),
    exit_status: run.status,
    stdout_tail: tail(run.stdout),
    stderr_tail: tail(run.stderr)
  };
}

function resolutionRecord(issue, strategy, run, extra = {}) {
  return {
    issue_type: issue.type,
    stage: issue.stage,
    strategy,
    attempted_at: new Date().toISOString(),
    ok: run.ok,
    exit_status: run.status,
    stdout_tail: tail(run.stdout),
    stderr_tail: tail(run.stderr),
    ...extra
  };
}

function buildMarkdown(report) {
  const lines = [
    '# Full Cycle Controller Report',
    '',
    `Generated: ${report.generated_at}`,
    `Channel: ${report.channel}`,
    `Topic: ${report.topic_id}`,
    `Publish At: ${report.publish_at || 'none'}`,
    `Status: ${report.status}`,
    '',
    '## Stage Results'
  ];

  for (const stage of report.stages) {
    lines.push(`- ${stage.stage}: ${stage.status}${stage.attempts > 1 ? ` after ${stage.attempts} attempt(s)` : ''}`);
  }

  lines.push('', '## Issues');
  if (!report.issues.length) {
    lines.push('- No issues detected.');
  } else {
    for (const issue of report.issues) {
      lines.push(`- ${issue.stage} | ${issue.type} | retryable=${issue.retryable}`);
    }
  }

  lines.push('', '## Resolutions');
  if (!report.resolutions.length) {
    lines.push('- No auto-resolution steps were needed.');
  } else {
    for (const resolution of report.resolutions) {
      lines.push(`- ${resolution.stage} | ${resolution.strategy} | ${resolution.ok ? 'resolved' : 'failed'}`);
    }
  }

  lines.push('', '## Unresolved');
  if (!report.unresolved.length) {
    lines.push('- None.');
  } else {
    for (const item of report.unresolved) {
      lines.push(`- ${item.stage} | ${item.type}`);
    }
  }

  if (report.delay_report) {
    lines.push('', '## Delay Report');
    lines.push(`- delayed_video_count: ${report.delay_report.delayed_video_count}`);
  }

  return lines.join('\n');
}

function executeStage(stage, channelCfg, context, report) {
  if (stage === 'assets' && (!channelCfg.assetsAgent || channelCfg.assetsAgent === channelCfg.ttsAgent)) {
    return { status: 'skipped', attempts: 0 };
  }

  if (stage === 'plan' && CHANNEL === 'saas_autopilot') {
    return { status: 'skipped', attempts: 0 };
  }

  if (stage === 'write') {
    const run = DRY_RUN
      ? { ok: true, status: 0, stdout: '[DRY RUN] write skipped', stderr: '' }
      : runNodeScript('script_writer_agent.js', ['--channel', CHANNEL, '--topic-id', String(TOPIC_ID)]);
    return handleStageRun(stage, run, channelCfg, context, report);
  }

  if (stage === 'status_sync') {
    return handleStatusSync(channelCfg, context, report);
  }

  if (stage === 'delay_check') {
    return handleDelayCheck(channelCfg, context, report);
  }

  const approval = checkApproval(CHANNEL, stage, context.publishAt);
  if (approval.decision !== 'allow') {
    const issue = {
      stage,
      type: 'approval_gate_block',
      retryable: false,
      detected_at: new Date().toISOString(),
      reason: approval.reason || 'Approval gate rejected action.'
    };
    report.issues.push(issue);
    report.unresolved.push(issue);
    return { status: 'blocked_by_policy', attempts: 0 };
  }

  const stageRun = stageRunner(stage, channelCfg, context.publishAt);
  return handleStageRun(stage, stageRun, channelCfg, context, report);
}

function stageRunner(stage, channelCfg, publishAt) {
  if (DRY_RUN) {
    return { ok: true, status: 0, stdout: `[DRY RUN] ${stage} skipped`, stderr: '' };
  }

  switch (stage) {
    case 'plan':
      return runNodeScript(channelCfg.planAgent, channelCfg.planArgs(TOPIC_ID));
    case 'tts':
      return runNodeScript(channelCfg.ttsAgent, channelCfg.ttsArgs(TOPIC_ID));
    case 'assets':
      return runNodeScript(channelCfg.assetsAgent, channelCfg.assetsArgs(TOPIC_ID));
    case 'edit':
      return runNodeScript(channelCfg.editAgent, channelCfg.editArgs(TOPIC_ID));
    case 'qc':
      return runNodeScript(channelCfg.qcAgent, channelCfg.qcArgs(TOPIC_ID));
    case 'upload':
      return runNodeScript(channelCfg.uploadAgent, channelCfg.uploadArgs(TOPIC_ID, publishAt));
    default:
      return { ok: false, status: 99, stdout: '', stderr: `Unhandled stage: ${stage}` };
  }
}

function handleStageRun(stage, initialRun, channelCfg, context, report) {
  let attempts = 1;
  let run = initialRun;
  if (run.ok) return { status: 'completed', attempts };

  let issue = issueRecord(stage, run, classifyFailure(stage, run));
  report.issues.push(issue);

  while (attempts <= MAX_RETRIES && issue.retryable) {
    const resolution = attemptResolution(issue, channelCfg, context);
    if (!resolution) break;
    report.resolutions.push(resolution);
    if (!resolution.ok) {
      attempts++;
      break;
    }

    const retryRun = stageRunner(stage, channelCfg, context.publishAt);
    attempts++;
    if (retryRun.ok) {
      report.resolutions.push({
        issue_type: issue.type,
        stage,
        strategy: 'retry_after_resolution',
        attempted_at: new Date().toISOString(),
        ok: true,
        exit_status: retryRun.status,
        stdout_tail: tail(retryRun.stdout),
        stderr_tail: tail(retryRun.stderr)
      });
      return { status: 'completed_after_retry', attempts };
    }

    issue = issueRecord(stage, retryRun, classifyFailure(stage, retryRun));
    report.issues.push(issue);
    if (!issue.retryable) break;
  }

  report.unresolved.push(issue);
  return { status: 'failed', attempts };
}

function attemptResolution(issue, channelCfg, context) {
  if (issue.type === 'slot_conflict') {
    const newSlot = nextAvailableSlot(CHANNEL);
    if (!newSlot || newSlot === context.publishAt) {
      return {
        issue_type: issue.type,
        stage: issue.stage,
        strategy: 'recompute_publish_slot',
        attempted_at: new Date().toISOString(),
        ok: false,
        exit_status: 1,
        stdout_tail: '',
        stderr_tail: 'Could not compute a new publish slot.'
      };
    }
    context.publishAt = newSlot;
    return {
      issue_type: issue.type,
      stage: issue.stage,
      strategy: 'recompute_publish_slot',
      attempted_at: new Date().toISOString(),
      ok: true,
      exit_status: 0,
      stdout_tail: `Updated publish_at to ${newSlot}`,
      stderr_tail: ''
    };
  }

  if (issue.type === 'auth_issue' || issue.type === 'status_sync_failure') {
    const syncRun = runNodeScript('youtube_status_agent.js', [`--channel=${channelCfg.statusChannel}`]);
    return resolutionRecord(issue, 'refresh_youtube_status', syncRun);
  }

  if (issue.stage === 'upload') {
    const syncRun = runNodeScript('sync_calendar_with_live.js');
    return resolutionRecord(issue, 'sync_metadata_with_live', syncRun);
  }

  return null;
}

function handleStatusSync(channelCfg, context, report) {
  if (DRY_RUN) return { status: 'completed', attempts: 0 };

  const statusRun = runNodeScript('youtube_status_agent.js', [`--channel=${channelCfg.statusChannel}`]);
  if (!statusRun.ok) {
    const issue = issueRecord('status_sync', statusRun, classifyFailure('status_sync', statusRun));
    report.issues.push(issue);
    report.unresolved.push(issue);
    return { status: 'failed', attempts: 1 };
  }

  const syncRun = runNodeScript('sync_calendar_with_live.js');
  if (!syncRun.ok) {
    const issue = issueRecord('status_sync', syncRun, classifyFailure('status_sync', syncRun));
    report.issues.push(issue);
    report.unresolved.push(issue);
    return { status: 'failed', attempts: 2 };
  }

  report.resolutions.push({
    issue_type: 'none',
    stage: 'status_sync',
    strategy: 'refresh_and_sync_live_status',
    attempted_at: new Date().toISOString(),
    ok: true,
    exit_status: 0,
    stdout_tail: tail(`${statusRun.stdout}\n${syncRun.stdout}`),
    stderr_tail: tail(`${statusRun.stderr}\n${syncRun.stderr}`)
  });
  return { status: 'completed', attempts: 2 };
}

function handleDelayCheck(channelCfg, context, report) {
  const delayReport = channelCfg.delayReportFile ? readJson(channelCfg.delayReportFile, null) : null;
  report.delay_report = delayReport;
  if (!delayReport) return { status: 'completed', attempts: 0 };

  const delayed = Array.isArray(delayReport.delayed_videos) ? delayReport.delayed_videos : [];
  if (!delayed.length) return { status: 'completed', attempts: 1 };

  for (const item of delayed) {
    const issue = {
      stage: 'delay_check',
      type: 'publish_delay_detected',
      retryable: false,
      detected_at: new Date().toISOString(),
      youtube_id: item.youtube_id,
      scheduled_publish_at: item.scheduled_publish_at,
      live_privacy_status: item.live_privacy_status,
      title: item.title
    };
    report.issues.push(issue);
    report.unresolved.push(issue);
  }
  return { status: 'failed', attempts: 1 };
}

function main() {
  if (!CHANNEL || !TOPIC_ID || !CHANNEL_CONFIG[CHANNEL]) {
    console.error('Usage: node automation/full_cycle_controller.js --channel <cs|saints|SAAS_AUTOPILOT> --topic-id <id>');
    process.exit(1);
  }

  const channelCfg = CHANNEL_CONFIG[CHANNEL];
  const sessionId = `${CHANNEL}_${String(TOPIC_ID).replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`;
  const publishAt = USER_PUBLISH_AT || nextAvailableSlot(CHANNEL);
  const context = { sessionId, publishAt };

  const report = {
    generated_at: new Date().toISOString(),
    session_id: sessionId,
    channel: CHANNEL,
    channel_name: channelCfg.name,
    topic_id: TOPIC_ID,
    publish_at: publishAt,
    dry_run: DRY_RUN,
    max_retries: MAX_RETRIES,
    stages: [],
    issues: [],
    resolutions: [],
    unresolved: [],
    tracker_summary: null,
    delay_report: null,
    status: 'running'
  };

  const startIndex = STAGES.indexOf(START_STAGE);
  if (startIndex === -1) {
    console.error(`Unknown stage: ${START_STAGE}`);
    process.exit(1);
  }

  for (const stage of STAGES.slice(startIndex)) {
    const outcome = executeStage(stage, channelCfg, context, report);
    report.stages.push({ stage, ...outcome });
    if (outcome.status === 'failed' || outcome.status === 'blocked_by_policy') {
      report.status = 'blocked';
      break;
    }
  }

  report.publish_at = context.publishAt;
  report.tracker_summary = trackerSummary(channelCfg);
  if (report.status === 'running') {
    report.status = report.unresolved.length ? 'completed_with_issues' : 'completed';
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportFile = path.join(REPORT_DIR, `${sessionId}.json`);
  const reportMd = path.join(REPORT_DIR, `${sessionId}.md`);
  writeJson(reportFile, report);
  writeText(reportMd, buildMarkdown(report));
  writeJson(LATEST_REPORT_FILE, report);
  writeText(LATEST_REPORT_MD, buildMarkdown(report));

  console.log(JSON.stringify({
    session_id: report.session_id,
    status: report.status,
    publish_at: report.publish_at,
    unresolved_issues: report.unresolved.length,
    report_file: path.relative(ROOT, reportFile)
  }, null, 2));

  if (report.status === 'blocked') process.exitCode = 1;
}

if (require.main === module) main();
