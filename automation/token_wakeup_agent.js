/**
 * token_wakeup_agent.js
 *
 * Checks whether the production system has usable access again, then wakes
 * low-risk Saints production agents. This is intentionally non-destructive:
 * no deletes, no public publishing, no paid spending.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT, SAINTS_ROOT, SAINTS_METADATA_DIR, resolveSaintsRelative } = require('./channel_paths');

const ROOT = REPO_ROOT;
const METADATA = path.join(ROOT, 'metadata');
const REPORT_FILE = path.join(METADATA, 'token_wakeup_report.json');
const TEXT_REPORT = path.join(METADATA, 'token_wakeup_report.md');
const NODE = process.execPath;

const args = process.argv.slice(2);
const channelArg = args.find(a => a.startsWith('--channel='));
const wake = args.includes('--wake') || args.includes('--auto-wake');
const channel = channelArg ? channelArg.split('=').slice(1).join('=').toLowerCase() : 'saints';

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (err) {
    return { error: err.message };
  }
}

function fileInfo(rel) {
  const abs = resolveSaintsRelative(rel) || path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return { exists: false, rel };
  const stat = fs.statSync(abs);
  return { exists: true, rel, size: stat.size, modified_at: stat.mtime.toISOString() };
}

function runAgent(scriptRelPath, agentArgs = [], cwd = ROOT) {
  const scriptPath = path.isAbsolute(scriptRelPath) ? scriptRelPath : path.join(ROOT, scriptRelPath);
  const result = spawnSync(NODE, [scriptPath, ...agentArgs], {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    env: process.env
  });
  return {
    agent: path.relative(ROOT, scriptPath),
    args: agentArgs,
    status: result.status,
    ok: result.status === 0,
    stdout_tail: String(result.stdout || '').split(/\r?\n/).slice(-18).join('\n').trim(),
    stderr_tail: String(result.stderr || '').split(/\r?\n/).slice(-12).join('\n').trim()
  };
}

function readSaintsJson(rel, fallback) {
  const file = path.join(SAINTS_ROOT, rel);
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (err) {
    return { error: err.message };
  }
}

function inspectTokens() {
  const saints = fileInfo('automation/credentials/saints_oauth_tokens.json');
  const corporate = fileInfo('automation/credentials/oauth_tokens.json');
  const saintsToken = saints.exists ? readJson(resolveSaintsRelative(saints.rel), {}) : {};
  const corporateToken = corporate.exists ? readJson(path.join(ROOT, corporate.rel), {}) : {};
  return {
    saints: {
      ...saints,
      has_access_token: Boolean(saintsToken.access_token),
      has_refresh_token: Boolean(saintsToken.refresh_token),
      expiry_date: saintsToken.expiry_date || null
    },
    corporate: {
      ...corporate,
      has_access_token: Boolean(corporateToken.access_token),
      has_refresh_token: Boolean(corporateToken.refresh_token),
      expiry_date: corporateToken.expiry_date || null
    }
  };
}

function nextSafeProduction(pmReport) {
  const actions = Array.isArray(pmReport.actions) ? pmReport.actions : [];
  const next = actions.find(a =>
    a.type === 'next_production' ||
    a.type === 'next_non_akathist_production' ||
    /Saints video \d+/i.test(String(a.action || ''))
  );
  if (!next) return { action: 'none', reason: 'No next production action found in PM report.' };
  const match = String(next.action || '').match(/Saints video (\d+)/i);
  if (!match) return { action: 'review_pm_report', reason: next.action };
  const id = Number(match[1]);
  return {
    action: 'prepare_next_saints_video',
    video_id: id,
    reason: next.action,
    suggested_commands: [
      `node "The Saints/automation/saints_generate_assets.js" ${id}`,
      `node "The Saints/automation/saints_editor_agent.js" ${id}`,
      `node automation/uploader_agent.js --channel=saints --only=SAINTS_VIDEO_${id}_FINAL.mp4 --privacy=private --dry-run --no-reserve-dry-run`
    ],
    note: 'Commands are suggested rather than executed here so the agent does not accidentally spend paid TTS/image/video credits.'
  };
}

function inspectSaintsVideo(id) {
  const assetsDir = path.join(SAINTS_ROOT, 'assets', `saints_video_${id}_assets`);
  const audioCount = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).filter(name => /^scene_\d+_audio\.wav$/i.test(name)).length
    : 0;
  const beatImageCount = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).filter(name => /^scene_\d+_beat_.+_image\.(png|jpg|jpeg)$/i.test(name)).length
    : 0;
  return { id, audioCount, beatImageCount };
}

function main() {
  fs.mkdirSync(METADATA, { recursive: true });
  const tokens = inspectTokens();
  const runs = [];
  let woke = false;

  const saintsReady = tokens.saints.exists && tokens.saints.has_refresh_token;
  if (wake && saintsReady) {
    runs.push(runAgent(path.join('automation', 'youtube_status_agent.js'), ['--channel=saints']));
    runs.push(runAgent(path.join('The Saints', 'automation', 'saints_pm_push_agent.js')));
    woke = true;
  }

  let pmReport = readSaintsJson(path.join('metadata', 'saints_pm_report.json'), {});
  let recommendation = nextSafeProduction(pmReport);
  const productionRuns = [];

  if (wake && saintsReady && recommendation.action === 'prepare_next_saints_video') {
    const state = inspectSaintsVideo(recommendation.video_id);
    if (state.audioCount === 0) {
      productionRuns.push(runAgent(path.join('The Saints', 'automation', 'saints_generate_assets.js'), [String(recommendation.video_id)]));
      productionRuns.push(runAgent(path.join('The Saints', 'automation', 'saints_pm_push_agent.js')));
      pmReport = readSaintsJson(path.join('metadata', 'saints_pm_report.json'), {});
      recommendation = nextSafeProduction(pmReport);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    channel,
    mode: wake ? 'wake_enabled' : 'check_only',
    woke_production_agents: woke,
    token_state: tokens,
    runs,
    production_runs: productionRuns,
    recommendation,
    safety_rules: {
      never_delete_without_vlad_approval: true,
      never_public_publish_without_vlad_approval: true,
      never_spend_money_or_use_paid_generation_without_preapproval: true,
      all_channels_should_keep_moving: true
    }
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  const md = [
    '# Token Wakeup Report',
    '',
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Woke agents: ${report.woke_production_agents}`,
    '',
    '## Token State',
    `- Saints token file: ${tokens.saints.exists ? 'present' : 'missing'}; refresh token: ${tokens.saints.has_refresh_token ? 'yes' : 'no'}`,
    `- Corporate token file: ${tokens.corporate.exists ? 'present' : 'missing'}; refresh token: ${tokens.corporate.has_refresh_token ? 'yes' : 'no'}`,
    '',
    '## Agent Runs',
    ...(runs.length ? runs.map(r => `- ${r.agent} ${r.ok ? 'OK' : 'FAILED'}${r.stderr_tail ? `: ${r.stderr_tail}` : ''}`) : ['- No agents run. Use --wake to run safe status/PM agents.']),
    '',
    '## Production Runs',
    ...(productionRuns.length ? productionRuns.map(r => `- ${r.agent} ${r.ok ? 'OK' : 'FAILED'}${r.stderr_tail ? `: ${r.stderr_tail}` : ''}`) : ['- No safe production step was needed or eligible.']),
    '',
    '## Next Safe Action',
    `- ${recommendation.action}: ${recommendation.reason || recommendation.note || 'No action.'}`
  ].join('\n');
  fs.writeFileSync(TEXT_REPORT, md);
  console.log(md);

  if (!saintsReady) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { inspectTokens, nextSafeProduction };
