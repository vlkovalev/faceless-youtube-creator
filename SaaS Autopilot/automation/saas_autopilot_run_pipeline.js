/**
 * SaaS Autopilot Full Pipeline Runner
 * =============================
 * Runs the complete pipeline for one topic: script → TTS → edit → (optional upload).
 *
 * Usage:
 *   node automation/saas_autopilot_run_pipeline.js --topic SAAS-001
 *   node automation/saas_autopilot_run_pipeline.js --topic SAAS-001 --stage tts
 *   node automation/saas_autopilot_run_pipeline.js --topic SAAS-001 --stage edit
 *   node automation/saas_autopilot_run_pipeline.js --topic SAAS-001 --stage upload --publish-at "2026-08-06T06:00:00Z"
 *   node automation/saas_autopilot_run_pipeline.js --topic SAAS-001 --dry-run
 *
 * Stages:
 *   script  — Generate script scaffold from topic backlog
 *   tts     — Generate voiceover audio (requires filled-in script + ELEVENLABS_API_KEY)
 *   edit    — Compile final video from assets + audio
 *   qa/qc   — Validate metadata, links, tags, and final video presence
 *   upload  — Upload to SaaS Autopilot YouTube channel (requires saas_autopilot_oauth_token.json)
 *   all     — Run script + tts + edit + qa (does NOT auto-upload — upload is always manual)
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { assertChannelNotOnHold } = require('./channel_hold_guard');

const AUTOMATION_DIR = __dirname;

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const TOPIC_ID  = (args.topic || args.t || '');
const STAGE     = (args.stage || 'all').toLowerCase();
const DRY_RUN   = args['dry-run'] || false;
const PUBLISH_AT = args['publish-at'] || null;

assertChannelNotOnHold('manual production pipeline');

if (!TOPIC_ID) {
  console.error('❌ Error: --topic is required.');
  console.error('   Example: node automation/saas_autopilot_run_pipeline.js --topic SAAS-001');
  process.exit(1);
}

function runAgent(scriptName, extraArgs = []) {
  const allArgs = [path.join(AUTOMATION_DIR, scriptName), '--topic', TOPIC_ID, ...extraArgs];
  if (DRY_RUN) allArgs.push('--dry-run');
  console.log(`\n▶  node ${scriptName} ${allArgs.slice(1).join(' ')}`);
  console.log('─'.repeat(50));
  const result = spawnSync('node', allArgs, { stdio: 'inherit', cwd: path.join(AUTOMATION_DIR, '..') });
  if (result.status !== 0) {
    console.error(`\n❌ ${scriptName} exited with code ${result.status}. Pipeline stopped.`);
    process.exit(result.status || 1);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`  SaaS Autopilot Pipeline — ${TOPIC_ID}`);
console.log(`  Stage: ${STAGE}${DRY_RUN ? ' (DRY RUN)' : ''}`);
console.log('='.repeat(50));

switch (STAGE) {
  case 'script':
    runAgent('saas_autopilot_script_agent.js');
    break;
  case 'tts':
    runAgent('saas_autopilot_tts_agent.js', ['--overwrite']);
    break;
  case 'edit':
    runAgent('saas_autopilot_editor_agent.js');
    break;
  case 'qa':
  case 'qc':
    runAgent('saas_autopilot_qa_agent.js');
    break;
  case 'upload':
    runAgent('saas_autopilot_publisher_agent.js', PUBLISH_AT ? ['--publish-at', PUBLISH_AT] : []);
    break;
  case 'all':
  default:
    runAgent('saas_autopilot_script_agent.js');
    runAgent('saas_autopilot_tts_agent.js');
    runAgent('saas_autopilot_editor_agent.js', ['--overwrite']);
    runAgent('saas_autopilot_qa_agent.js');
    break;
}

console.log(`\n${'='.repeat(50)}`);
console.log(`  Pipeline stage complete: ${STAGE}`);
console.log('='.repeat(50) + '\n');
