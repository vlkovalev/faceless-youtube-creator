/**
 * saas_autopilot_master_autopilot.js — Full Autonomous Pipeline for SaaS Autopilot Channel
 * ==========================================================================
 * Single entry point for hands-free video production. Runs the complete pipeline
 * for any topic ID without human input or manual approval gates.
 *
 * Pipeline order:
 *   1. script  — Auto-writes complete voiceover script using Claude (online) or Local Engine (offline)
 *   2. tts     — Auto-generates voiceover audio (ElevenLabs)
 *   3. edit    — Compiles final video with Ken Burns animations and music (ffmpeg)
 *   4. qc      — Runs automated checks
 *   5. upload  — Schedules upload to correct YouTube Brand account OAuth slot
 *
 * Usage:
 *   node SaaS Autopilot/automation/saas_autopilot_master_autopilot.js --topic SAAS-001
 *   node SaaS Autopilot/automation/saas_autopilot_master_autopilot.js --topic SAAS-002 --stage tts
 *   node SaaS Autopilot/automation/saas_autopilot_master_autopilot.js --topic SAAS-002 --dry-run
 *
 * Environment variables (set in SaaS Autopilot/automation/credentials/.env):
 *   ANTHROPIC_API_KEY   — for script writing
 *   ELEVENLABS_API_KEY  — for TTS voiceover
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { assertChannelNotOnHold } = require('./channel_hold_guard');

const AUTOMATION_DIR = __dirname;
const ROOT           = path.resolve(AUTOMATION_DIR, '..');
const META_DIR       = path.join(ROOT, 'metadata');
const LOG_DIR        = path.join(ROOT, 'metadata', 'autopilot_logs');
const ENV_PATH       = path.join(AUTOMATION_DIR, 'credentials', '.env');

// Load environment variables from the isolated credentials/.env
require('dotenv').config({ path: ENV_PATH });

// ── CLI Args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    acc[key] = (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[++i] : true;
  }
  return acc;
}, {});

const TOPIC_ID    = args.topic || args.t || args.id;
const START_STAGE = (args.stage || 'script').toLowerCase();
const DRY_RUN     = args['dry-run'] === true || args['dry-run'] === 'true';
const PUBLISH_AT  = args['publish-at'] || null;

const STAGES = ['script', 'tts', 'edit', 'qc', 'upload'];

assertChannelNotOnHold('master autopilot');

// ── Helpers ───────────────────────────────────────────────────────────────────
function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function log(sessionId, message) {
  const entry = `[${new Date().toISOString()}] ${message}`;
  console.log(entry);
  if (sessionId) {
    const logPath = path.join(LOG_DIR, `${sessionId}.log`);
    fs.appendFileSync(logPath, entry + '\n');
  }
}

function runAgent(label, agentScript, agentArgs, sessionId) {
  const dryArgs = DRY_RUN ? ['--dry-run'] : [];
  const fullArgs = [path.join(AUTOMATION_DIR, agentScript), ...agentArgs, ...dryArgs];

  log(sessionId, `▶  ${label}: node ${agentScript} ${agentArgs.join(' ')}`);

  if (DRY_RUN) {
    log(sessionId, `   [DRY RUN] Skipping execution`);
    return { ok: true, skipped: true };
  }

  const result = spawnSync(process.execPath, fullArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    env: { ...process.env }
  });

  const ok = result.status === 0;
  if (!ok) {
    log(sessionId, `❌  ${label} FAILED (exit ${result.status})`);
    if (result.stderr) log(sessionId, `   STDERR: ${result.stderr.slice(0, 500)}`);
  } else {
    log(sessionId, `✅  ${label} complete`);
  }

  return { ok, status: result.status };
}

function nextAvailableSlot() {
  const slatePath = path.join(ROOT, 'metadata', 'canonical_slate.json');
  const slate = readJson(slatePath);
  const channelSlots = slate['saas_autopilot'] || [];
  
  // Filter for slots that are canonical and have a valid, non-null slot defined
  const occupied = channelSlots.filter(e => e.canonical && e.slot);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(7, 0, 0, 0);
  const defaultSlotStr = tomorrow.toISOString().slice(0, 19) + '.000Z';

  if (occupied.length === 0) {
    return defaultSlotStr;
  }

  // Find the latest scheduled slot time
  const slots = occupied.map(e => new Date(e.slot).getTime()).filter(t => !isNaN(t));
  if (slots.length === 0) {
    return defaultSlotStr;
  }

  const maxSlotTime = Math.max(...slots);
  const nowTime = Date.now();

  // If the latest slot is in the past, count 2 days starting from now
  const baseTime = maxSlotTime < nowTime ? nowTime : maxSlotTime;

  // Next slot is exactly 2 days after the base time, set at 7:00 AM UTC
  const nextSlot = new Date(baseTime + 2 * 24 * 60 * 60 * 1000);
  nextSlot.setHours(7, 0, 0, 0);
  return nextSlot.toISOString().slice(0, 19) + '.000Z';
}

function saveProgress(sessionFile, stage, status) {
  const data = readJson(sessionFile, { stages: {} });
  data.stages[stage] = { status, timestamp: new Date().toISOString() };
  data.last_updated = new Date().toISOString();
  writeJson(sessionFile, data);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!TOPIC_ID) {
    console.error('❌  Usage: node SaaS Autopilot/automation/saas_autopilot_master_autopilot.js --topic SAAS-001');
    process.exit(1);
  }

  // Session tracking
  const sessionId   = `SAAS_AUTOPILOT_${String(TOPIC_ID).replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`;
  const sessionFile = path.join(LOG_DIR, `${sessionId}.json`);
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  const publishAt = PUBLISH_AT || nextAvailableSlot();

  console.log('\n' + '='.repeat(60));
  console.log(`  🤖  SaaS Autopilot Master Autopilot`);
  console.log(`  Topic   : ${TOPIC_ID}`);
  console.log(`  Start   : Stage "${START_STAGE}"`);
  console.log(`  Publish : ${publishAt || 'private (no slot found)'}`);
  if (DRY_RUN) console.log(`  Mode    : DRY RUN`);
  console.log('='.repeat(60) + '\n');

  writeJson(sessionFile, {
    channel: 'saas_autopilot',
    topic_id: TOPIC_ID,
    publish_at: publishAt,
    started_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    stages: {}
  });

  const startIdx = STAGES.indexOf(START_STAGE);
  if (startIdx === -1) {
    console.error(`❌  Unknown stage: ${START_STAGE}. Valid: ${STAGES.join(', ')}`);
    process.exit(1);
  }

  const activeStages = STAGES.slice(startIdx);

  for (const stage of activeStages) {
    log(sessionId, `\n── Stage: ${stage.toUpperCase()} ──`);

    let result = { ok: true };

    switch (stage) {
      case 'script': {
        result = runAgent(
          'Script Writer',
          'saas_autopilot_script_agent.js',
          ['--topic', String(TOPIC_ID)],
          sessionId
        );
        break;
      }

      case 'tts': {
        result = runAgent(
          'TTS / Voiceover',
          'saas_autopilot_tts_agent.js',
          ['--topic', String(TOPIC_ID)],
          sessionId
        );
        break;
      }

      case 'edit': {
        result = runAgent(
          'Video Editor',
          'saas_autopilot_editor_agent.js',
          ['--topic', String(TOPIC_ID), '--overwrite'],
          sessionId
        );
        break;
      }

      case 'qc': {
        result = runAgent(
          'QA / QC',
          'saas_autopilot_qa_agent.js',
          ['--topic', String(TOPIC_ID)],
          sessionId
        );
        break;
      }

      case 'upload': {
        result = runAgent(
          'Upload',
          'saas_autopilot_publisher_agent.js',
          [
            '--topic', String(TOPIC_ID),
            ...(publishAt ? ['--publish-at', publishAt] : [])
          ],
          sessionId
        );
        break;
      }
    }

    saveProgress(sessionFile, stage, result.ok ? 'complete' : 'failed');

    if (!result.ok && !result.skipped) {
      log(sessionId, `\n🛑  Pipeline stopped at stage: ${stage}`);
      log(sessionId, `   Review logs: ${sessionFile}`);
      process.exit(1);
    }
  }

  log(sessionId, '\n' + '='.repeat(60));
  log(sessionId, `  ✅  Pipeline complete: SaaS Autopilot — ${TOPIC_ID}`);
  if (publishAt) log(sessionId, `  📅  Scheduled for: ${publishAt}`);
  log(sessionId, '='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
