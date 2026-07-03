'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const METADATA = path.join(ROOT, 'metadata');
const REPORT_FILE = path.join(METADATA, 'token_wakeup_report.json');
const TEXT_REPORT = path.join(METADATA, 'token_wakeup_report.md');
const NODE = process.execPath;

const args = process.argv.slice(2);
const wake = args.includes('--wake') || args.includes('--auto-wake');

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (err) {
    return fallback;
  }
}

function fileInfo(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return { exists: false, rel };
  const stat = fs.statSync(abs);
  return { exists: true, rel, size: stat.size, modified_at: stat.mtime.toISOString() };
}

function runAgent(scriptRelPath, agentArgs = []) {
  const scriptPath = path.join(ROOT, scriptRelPath);
  const result = spawnSync(NODE, [scriptPath, ...agentArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
    env: process.env
  });
  return {
    agent: path.relative(ROOT, scriptPath).replace(/\\/g, '/'),
    args: agentArgs,
    status: result.status,
    ok: result.status === 0,
    stdout_tail: String(result.stdout || '').split(/\r?\n/).slice(-18).join('\n').trim(),
    stderr_tail: String(result.stderr || '').split(/\r?\n/).slice(-12).join('\n').trim()
  };
}

function inspectTokens() {
  const corporate = fileInfo(path.join('automation', 'credentials', 'oauth_tokens.json'));
  const token = corporate.exists ? readJson(path.join(ROOT, corporate.rel), {}) : {};
  return {
    corporate: {
      ...corporate,
      has_access_token: Boolean(token.access_token),
      has_refresh_token: Boolean(token.refresh_token),
      expiry_date: token.expiry_date || null
    }
  };
}

function buildRecommendation() {
  const replacementQueue = readJson(path.join(METADATA, 'real_image_replacement_queue.json'), {});
  const nextByVideo = Object.entries(replacementQueue.by_video || {})
    .map(([videoId, count]) => ({ video_id: Number(videoId), pending_assets: Number(count) }))
    .sort((a, b) => b.pending_assets - a.pending_assets)[0];
  if (nextByVideo) {
    return {
      action: 'continue_real_visual_replacements',
      video_id: nextByVideo.video_id,
      reason: `Video ${nextByVideo.video_id} has the largest remaining archival replacement queue (${nextByVideo.pending_assets} assets).`
    };
  }

  const live = readJson(path.join(METADATA, 'youtube_channel_status.json'), {});
  const nextScheduled = (live.videos || [])
    .filter(video => video.privacy_status === 'private' && video.publish_at)
    .sort((a, b) => String(a.publish_at).localeCompare(String(b.publish_at)))[0];
  if (nextScheduled) {
    return {
      action: 'review_next_private_draft',
      youtube_id: nextScheduled.youtube_id,
      reason: `${nextScheduled.title} is the next scheduled private draft for ${nextScheduled.publish_at}.`
    };
  }

  return { action: 'none', reason: 'No next production action found in local Corporate Shadows reports.' };
}

function main() {
  fs.mkdirSync(METADATA, { recursive: true });
  const tokens = inspectTokens();
  const runs = [];
  let woke = false;

  const corporateReady = tokens.corporate.exists && tokens.corporate.has_refresh_token;
  if (wake && corporateReady) {
    runs.push(runAgent(path.join('automation', 'youtube_status_agent.js')));
    runs.push(runAgent(path.join('automation', 'pm_agent.js')));
    woke = true;
  }

  const recommendation = buildRecommendation();
  const report = {
    generated_at: new Date().toISOString(),
    channel: 'corporate',
    mode: wake ? 'wake_enabled' : 'check_only',
    woke_production_agents: woke,
    token_state: tokens,
    runs,
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
    `- Corporate token file: ${tokens.corporate.exists ? 'present' : 'missing'}; refresh token: ${tokens.corporate.has_refresh_token ? 'yes' : 'no'}`,
    '',
    '## Agent Runs',
    ...(runs.length ? runs.map(r => `- ${r.agent} ${r.ok ? 'OK' : 'FAILED'}${r.stderr_tail ? `: ${r.stderr_tail}` : ''}`) : ['- No agents run. Use --wake to run safe status/PM agents.']),
    '',
    '## Next Safe Action',
    `- ${recommendation.action}: ${recommendation.reason || 'No action.'}`
  ].join('\n');
  fs.writeFileSync(TEXT_REPORT, md);
  console.log(md);

  if (!corporateReady) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { inspectTokens, buildRecommendation };
