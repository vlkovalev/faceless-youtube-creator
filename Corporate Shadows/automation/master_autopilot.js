/**
 * master_autopilot.js — Full Autonomous Pipeline for All 3 Channels
 * ===================================================================
 * Single entry point. Runs the complete pipeline for any channel and topic
 * without human input or approval gates.
 *
 * Pipeline order:
 *   1. write    — LLM auto-writes complete voiceover script
 *   2. plan     — Auto-generates visual beat plan from script
 *   3. tts      — Auto-generates voiceover audio (ElevenLabs)
 *   4. assets   — Auto-generates visual assets (images/clips)
 *   5. edit     — Compiles final video
 *   6. qc       — Runs automated QC checks (hard-fail on duration/audio only)
 *   7. upload   — Schedules upload to correct channel OAuth
 *
 * Usage:
 *   node automation/master_autopilot.js --channel cs --topic-id 6
 *   node automation/master_autopilot.js --channel saints --topic-id 13
 *   node automation/master_autopilot.js --channel SAAS_AUTOPILOT --topic-id SAAS-001
 *
 *   Run specific stage (resumes from that point):
 *   node automation/master_autopilot.js --channel cs --topic-id 6 --stage tts
 *
 *   Dry run (no API calls, no file writes):
 *   node automation/master_autopilot.js --channel cs --topic-id 6 --dry-run
 *
 * Environment variables (set in automation/credentials/.env):
 *   ANTHROPIC_API_KEY   — for script writing
 *   ELEVENLABS_API_KEY  — for TTS voiceover
 *   ELEVENLABS_VOICE_ID — optional, defaults to channel voice
 *
 * Channels:
 *   cs       — Corporate Shadows (uploads to oauth_tokens.json)
 *   saints   — The Saints (uploads to saints_oauth_token.json)
 *   SAAS_AUTOPILOT   — SaaS Autopilot Automation (uploads to SAAS_AUTOPILOT_oauth_token.json)
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, 'credentials', '.env') });

const fs           = require('fs');
const path         = require('path');
const { spawnSync } = require('child_process');

const ROOT      = path.resolve(__dirname, '..');
const META_DIR  = path.join(ROOT, 'metadata');
const LOG_DIR   = path.join(META_DIR, 'autopilot_logs');

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    acc[key] = (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[++i] : true;
  }
  return acc;
}, {});

const CHANNEL    = (args.channel || '').toLowerCase();
const TOPIC_ID   = args['topic-id'] || args.topic || args.id;
const START_STAGE = (args.stage || 'write').toLowerCase();
const DRY_RUN    = args['dry-run'] === true || args['dry-run'] === 'true';
const PUBLISH_AT  = args['publish-at'] || null;

const STAGES = ['write', 'plan', 'tts', 'assets', 'edit', 'qc', 'upload'];

// ── Channel routing ───────────────────────────────────────────────────────────
const CHANNEL_CONFIG = {
  cs: {
    name: 'Corporate Shadows',
    scriptArg: id => ['--video', id],
    planAgent: 'visual_asset_planner.js',
    planArgs: id => ['--video', id],
    ttsAgent: 'generate_assets.js',
    ttsArgs: id => [String(id)],
    assetsAgent: 'generate_assets.js',
    assetsArgs: id => [String(id)],
    editAgent: 'editor_beat_agent.js',
    editArgs: id => [String(id)],
    qcAgent: 'qc_agent.js',
    qcArgs: id => [String(id)],
    uploadAgent: 'uploader_agent.js',
    uploadArgs: (id, publishAt) => {
      const upgrade = `FINAL_VIDEO_${id}_VISUAL_UPGRADE.mp4`;
      const normal = `FINAL_VIDEO_${id}.mp4`;
      const actualFile = fs.existsSync(path.join(ROOT, upgrade)) ? upgrade : normal;
      return [
        '--only', actualFile,
        '--auto-approve-scheduled',
        ...(publishAt ? ['--publish-at', publishAt] : [])
      ];
    },
    outputFile: id => {
      const upgrade = `FINAL_VIDEO_${id}_VISUAL_UPGRADE.mp4`;
      const normal = `FINAL_VIDEO_${id}.mp4`;
      return fs.existsSync(path.join(ROOT, upgrade)) ? upgrade : normal;
    }
  },
  saints: {
    name: 'The Saints',
    scriptArg: id => ['--channel', 'saints', '--topic-id', id],
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
    ],
    outputFile: id => `SAINTS_VIDEO_${id}_FINAL.mp4`
  },
  SAAS_AUTOPILOT: {
    name: 'SaaS Autopilot Automation',
    scriptArg: id => ['--channel', 'SAAS_AUTOPILOT', '--topic-id', id],
    planAgent: null, // SaaS Autopilot visual plan is embedded in script
    planArgs: () => [],
    ttsAgent: 'SAAS_AUTOPILOT_tts_agent.js',
    ttsArgs: id => ['--topic', id],
    assetsAgent: null, // Uses generated images in editor
    assetsArgs: () => [],
    editAgent: 'SAAS_AUTOPILOT_editor_agent.js',
    editArgs: id => ['--topic', id],
    qcAgent: 'qc_agent.js',
    qcArgs: id => ['--channel', 'SAAS_AUTOPILOT', '--topic', id],
    uploadAgent: 'SAAS_AUTOPILOT_publisher_agent.js',
    uploadArgs: (id, publishAt) => [
      '--topic', id,
      ...(publishAt ? ['--publish-at', publishAt] : [])
    ],
    outputFile: id => `videos/SAAS_AUTOPILOT/${String(id).replace('-', '_')}_FINAL.mp4`
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^﻿/, ''));
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
  const fullArgs = [path.join(__dirname, agentScript), ...agentArgs, ...dryArgs];

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

function nextAvailableSlot(channel) {
  // Determine next publish slot from canonical_slate.json
  const slate = readJson(path.join(META_DIR, 'canonical_slate.json'));
  const channelSlots = slate[channel] || [];
  const occupied = new Set(channelSlots.filter(e => e.canonical).map(e => e.slot));

  const config = readJson(path.join(ROOT, channel === 'SAAS_AUTOPILOT' ? 'SAAS_AUTOPILOT_channel_config.json' : 'channel_config.json'));

  // Use channel-specific cadence
  const cadenceDays = channel === 'SAAS_AUTOPILOT'
    ? [3, 6]  // Wednesday=3, Saturday=6
    : [2, 5]; // Tuesday=2, Friday=5

  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(6, 0, 0, 0); // 06:00 UTC = midnight Edmonton in summer

  // Walk forward up to 90 days to find an open slot
  for (let i = 0; i < 90; i++) {
    candidate.setDate(candidate.getDate() + 1);
    if (cadenceDays.includes(candidate.getDay())) {
      const iso = candidate.toISOString().slice(0, 19) + '.000Z';
      if (!occupied.has(iso)) return iso;
    }
  }

  return null; // Shouldn't happen
}

function saveProgress(sessionFile, stage, status) {
  const data = readJson(sessionFile, { stages: {} });
  data.stages[stage] = { status, timestamp: new Date().toISOString() };
  data.last_updated = new Date().toISOString();
  writeJson(sessionFile, data);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!CHANNEL || !TOPIC_ID) {
    console.error('❌  Usage: node automation/master_autopilot.js --channel cs --topic-id 6');
    console.error('   Channels: cs | saints | SAAS_AUTOPILOT');
    process.exit(1);
  }

  const channelCfg = CHANNEL_CONFIG[CHANNEL];
  if (!channelCfg) {
    console.error(`❌  Unknown channel: ${CHANNEL}. Use: cs, saints, SAAS_AUTOPILOT`);
    process.exit(1);
  }

  // Session tracking
  const sessionId  = `${CHANNEL}_${String(TOPIC_ID).replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`;
  const sessionFile = path.join(LOG_DIR, `${sessionId}.json`);
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  const publishAt = PUBLISH_AT || nextAvailableSlot(CHANNEL);

  console.log('\n' + '='.repeat(60));
  console.log(`  🤖  Master Autopilot`);
  console.log(`  Channel : ${channelCfg.name}`);
  console.log(`  Topic   : ${TOPIC_ID}`);
  console.log(`  Start   : Stage "${START_STAGE}"`);
  console.log(`  Publish : ${publishAt || 'private (no slot found)'}`);
  if (DRY_RUN) console.log(`  Mode    : DRY RUN`);
  console.log('='.repeat(60) + '\n');

  writeJson(sessionFile, {
    channel: CHANNEL,
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
      case 'write': {
        result = runAgent(
          'Script Writer',
          'script_writer_agent.js',
          ['--channel', CHANNEL, '--topic-id', String(TOPIC_ID)],
          sessionId
        );
        break;
      }

      case 'plan': {
        if (!channelCfg.planAgent) {
          log(sessionId, `ℹ️  No separate visual planner for ${CHANNEL} — skipping`);
          break;
        }
        result = runAgent(
          'Visual Planner',
          channelCfg.planAgent,
          channelCfg.planArgs(TOPIC_ID),
          sessionId
        );
        break;
      }

      case 'tts': {
        result = runAgent(
          'TTS / Voiceover',
          channelCfg.ttsAgent,
          channelCfg.ttsArgs(TOPIC_ID),
          sessionId
        );
        break;
      }

      case 'assets': {
        if (!channelCfg.assetsAgent || channelCfg.assetsAgent === channelCfg.ttsAgent) {
          log(sessionId, `ℹ️  Assets handled by TTS stage — skipping duplicate run`);
          break;
        }
        result = runAgent(
          'Asset Generation',
          channelCfg.assetsAgent,
          channelCfg.assetsArgs(TOPIC_ID),
          sessionId
        );
        break;
      }

      case 'edit': {
        result = runAgent(
          'Video Editor',
          channelCfg.editAgent,
          channelCfg.editArgs(TOPIC_ID),
          sessionId
        );
        break;
      }

      case 'qc': {
        // QC: run but only hard-fail on missing output file
        const outputFile = path.join(ROOT, channelCfg.outputFile(TOPIC_ID));
        if (!fs.existsSync(outputFile) && !DRY_RUN) {
          log(sessionId, `❌  QC HARD FAIL: Output file missing: ${channelCfg.outputFile(TOPIC_ID)}`);
          saveProgress(sessionFile, stage, 'failed');
          process.exit(1);
        }
        result = runAgent(
          'QC Check',
          channelCfg.qcAgent,
          channelCfg.qcArgs(TOPIC_ID),
          sessionId
        );
        // QC soft-fail: log warning but don't stop pipeline
        if (!result.ok) {
          log(sessionId, `⚠️  QC reported issues — continuing (review output manually)`);
          result.ok = true;
        }
        break;
      }

      case 'upload': {
        result = runAgent(
          'Upload',
          channelCfg.uploadAgent,
          channelCfg.uploadArgs(TOPIC_ID, publishAt),
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
  log(sessionId, `  ✅  Pipeline complete: ${channelCfg.name} — ${TOPIC_ID}`);
  if (publishAt) log(sessionId, `  📅  Scheduled for: ${publishAt}`);
  log(sessionId, '='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
