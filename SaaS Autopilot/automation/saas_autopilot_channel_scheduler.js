/**
 * saas_autopilot_channel_scheduler.js — Full Channel Automator & Orchestrator
 * =========================================================================
 * Sequentially scans the backlog, finds all topics that have not yet been
 * uploaded, and runs the complete autopilot pipeline for them.
 *
 * Usage:
 *   node SaaS Autopilot/automation/saas_autopilot_channel_scheduler.js
 *   node SaaS Autopilot/automation/saas_autopilot_channel_scheduler.js --dry-run
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { assertChannelNotOnHold } = require('./channel_hold_guard');

const AUTOMATION_DIR = __dirname;
const WORKSPACE_DIR  = path.join(AUTOMATION_DIR, '..');
const CONFIG_FILE    = path.join(WORKSPACE_DIR, 'saas_autopilot_channel_config.json');
const TRACKER_FILE   = path.join(WORKSPACE_DIR, 'metadata', 'uploads_tracker.json');

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    acc[arg.slice(2)] = true;
  }
  return acc;
}, {});

const DRY_RUN = args['dry-run'] || false;

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

async function main() {
  assertChannelNotOnHold('channel scheduler');

  console.log(`\n=============================================================`);
  console.log(`  🦾 SaaS Autopilot Full Channel Automator`);
  console.log(`  Dry Run     : ${DRY_RUN ? 'ACTIVE' : 'INACTIVE'}`);
  console.log(`=============================================================\n`);

  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`❌ Configuration file missing at: ${CONFIG_FILE}`);
    process.exit(1);
  }

  const config = readJson(CONFIG_FILE);
  const tracker = readJson(TRACKER_FILE, { uploaded_files: {} });

  const backlog = config.topic_backlog || [];
  const uploadedFilesKeys = Object.keys(tracker.uploaded_files);

  console.log(`📊 Total backlog topics: ${backlog.length}`);
  console.log(`📈 Previously uploaded episodes: ${uploadedFilesKeys.length}`);

  let runCount = 0;

  for (const topic of backlog) {
    const topicId = topic.id;
    const targetFile = `${topicId.replace('-', '_')}_FINAL.mp4`;

    // Check if uploaded
    const isUploaded = uploadedFilesKeys.some(key => {
      return key.toUpperCase() === targetFile.toUpperCase() || 
             (tracker.uploaded_files[key] && tracker.uploaded_files[key].title === topic.title);
    });

    if (isUploaded) {
      console.log(`⏭️  Topic ${topicId} ("${topic.title}") has already been uploaded. Skipping.`);
      continue;
    }

    runCount++;
    console.log(`\n🚀 [Episode #${runCount}] Found next unreleased topic: ${topicId}`);
    console.log(`   Title: "${topic.title}"`);
    console.log(`   Hook : "${topic.hook}"\n`);
    console.log(`⏳ Starting Master Autopilot for ${topicId}...`);

    const autopilotScript = path.join(AUTOMATION_DIR, 'saas_autopilot_master_autopilot.js');
    const autopilotArgs = ['--topic', topicId];
    if (DRY_RUN) autopilotArgs.push('--dry-run');

    const result = spawnSync(process.execPath, [autopilotScript, ...autopilotArgs], {
      cwd: WORKSPACE_DIR,
      stdio: 'inherit',
      encoding: 'utf8',
      shell: false,
      windowsHide: true
    });

    if (result.status !== 0) {
      console.error(`\n❌ Autopilot pipeline failed for topic ${topicId} with exit code ${result.status}.`);
      console.log(`🛑 Stopping scheduler execution to prevent cascading failures.`);
      process.exit(1);
    }

    console.log(`✅ Autopilot completed successfully for topic ${topicId}.\n`);
  }

  if (runCount === 0) {
    console.log(`\n🎉 All backlog topics have been successfully processed and uploaded!`);
  } else {
    console.log(`\n🏆 Scheduler finished. Processed ${runCount} episodes.`);
  }
}

main().catch(err => {
  console.error('\nFatal Scheduler Error:', err.message);
  process.exit(1);
});
