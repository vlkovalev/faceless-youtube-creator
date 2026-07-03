/**
 * batch_produce.js — Batch Pipeline Runner for All Channels
 * ===========================================================
 * Runs master_autopilot.js for a list of topics across all channels.
 * Processes one video at a time. Logs results. Continues on failure.
 *
 * Usage:
 *   node automation/batch_produce.js                  # runs all pending topics
 *   node automation/batch_produce.js --channel cs     # CS only
 *   node automation/batch_produce.js --channel saints # Saints only
 *   node automation/batch_produce.js --stage tts      # resume all at TTS stage
 *   node automation/batch_produce.js --dry-run        # no API calls
 *
 * Pending topics are read from metadata/production_queue.json.
 * Update that file to control what runs next.
 */

'use strict';

const fs            = require('fs');
const path          = require('path');
const { spawnSync } = require('child_process');

const ROOT      = path.resolve(__dirname, '..');
const META_DIR  = path.join(ROOT, 'metadata');
const QUEUE_FILE = path.join(META_DIR, 'production_queue.json');

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    acc[key] = (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[++i] : true;
  }
  return acc;
}, {});

const FILTER_CHANNEL = args.channel || null;
const START_STAGE    = args.stage || 'write';
const DRY_RUN        = args['dry-run'] === true || args['dry-run'] === 'true';

function readJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) {
    console.log(`⚠️  No production queue found at ${QUEUE_FILE}`);
    console.log(`   Creating default queue from channel configs...`);
    return buildDefaultQueue();
  }
  return readJson(QUEUE_FILE, []);
}

function buildDefaultQueue() {
  const queue = [];

  // Corporate Shadows — load from next_slate.json
  try {
    const slate = readJson(path.join(META_DIR, 'next_slate.json'), {});
    for (const ep of slate.corporate_shadows || []) {
      if (ep.status === 'paused') continue;
      queue.push({ channel: 'cs', topic_id: ep.script_id, title: ep.title, status: 'pending' });
    }
  } catch {}

  // Saints — load from next_slate.json
  try {
    const slate = readJson(path.join(META_DIR, 'next_slate.json'), {});
    for (const ep of slate.the_saints || []) {
      if (ep.status === 'script_v1_exists' || ep.status === 'script_v1_created' || ep.status === 'script_v1_and_visual_plan_created') {
        queue.push({ channel: 'saints', topic_id: ep.script_id || ep.id.replace('SAINTS-0', ''), title: ep.title, status: 'pending' });
      }
    }
  } catch {}

  // SaaS Autopilot — load from SAAS_AUTOPILOT_channel_config.json
  try {
    const config = readJson(path.join(ROOT, 'SAAS_AUTOPILOT_channel_config.json'), {});
    for (const topic of config.topic_backlog || []) {
      queue.push({ channel: 'SAAS_AUTOPILOT', topic_id: topic.id, title: topic.title, status: 'pending' });
    }
  } catch {}

  // Save the generated queue
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  console.log(`   Saved default queue with ${queue.length} items to ${QUEUE_FILE}`);
  return queue;
}

async function main() {
  const queue = loadQueue();
  const filtered = queue.filter(item => {
    if (item.status === 'complete' || item.status === 'skipped') return false;
    if (FILTER_CHANNEL && item.channel !== FILTER_CHANNEL) return false;
    return true;
  });

  if (filtered.length === 0) {
    console.log('✅  No pending items in production queue.');
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  🏭  Batch Producer`);
  console.log(`  Items     : ${filtered.length}`);
  console.log(`  Start stage: ${START_STAGE}`);
  if (FILTER_CHANNEL) console.log(`  Channel filter: ${FILTER_CHANNEL}`);
  if (DRY_RUN) console.log(`  Mode: DRY RUN`);
  console.log('='.repeat(60) + '\n');

  const results = [];

  for (const item of filtered) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  🎬  ${item.channel.toUpperCase()} — ${item.topic_id} — ${item.title || ''}`);
    console.log('─'.repeat(60));

    const agentArgs = [
      path.join(__dirname, 'master_autopilot.js'),
      '--channel', item.channel,
      '--topic-id', String(item.topic_id),
      '--stage', START_STAGE
    ];
    if (DRY_RUN) agentArgs.push('--dry-run');

    const result = spawnSync(process.execPath, agentArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      encoding: 'utf8',
      env: { ...process.env }
    });

    const ok = result.status === 0;
    results.push({ ...item, result: ok ? 'complete' : 'failed' });

    // Update queue file status
    const currentQueue = readJson(QUEUE_FILE, []);
    const idx = currentQueue.findIndex(q => q.channel === item.channel && String(q.topic_id) === String(item.topic_id));
    if (idx >= 0) {
      currentQueue[idx].status = ok ? 'complete' : 'failed';
      currentQueue[idx].processed_at = new Date().toISOString();
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(currentQueue, null, 2));
    }

    if (!ok) {
      console.warn(`\n⚠️  ${item.channel} ${item.topic_id} failed — continuing to next item`);
    }
  }

  // Summary
  const done    = results.filter(r => r.result === 'complete').length;
  const failed  = results.filter(r => r.result === 'failed').length;

  console.log('\n' + '='.repeat(60));
  console.log(`  Batch complete: ${done} succeeded, ${failed} failed`);
  if (failed > 0) {
    console.log('\n  Failed items:');
    results.filter(r => r.result === 'failed').forEach(r => {
      console.log(`    ✗ ${r.channel} ${r.topic_id} — ${r.title || ''}`);
    });
    console.log(`\n  Retry with: node automation/batch_produce.js --stage [last_good_stage]`);
  }
  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
