/**
 * saints_batch_produce.js — Batch production runner for The Saints channel
 * Coordinates the sequential execution of the autopilot agent for a range of video IDs.
 *
 * Usage:
 *   node automation/saints_batch_produce.js --start 2 --end 7 [--upload-private]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SHARED_ROOT = path.resolve(__dirname, '..');
const SAINTS_ROOT = path.join(SHARED_ROOT, 'The Saints');
const AUTOPILOT_SCRIPT = path.join(SAINTS_ROOT, 'automation', 'saints_full_autopilot_agent.js');

// Parse CLI arguments
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const START_ID = Number(args.start || args.s || 2);
const END_ID   = Number(args.end || args.e || 7);
const UPLOAD   = args['upload-private'] === true || args['upload-private'] === 'true';

async function main() {
  if (isNaN(START_ID) || isNaN(END_ID) || START_ID > END_ID) {
    console.error('❌ Error: Invalid range. Use --start <id> --end <id>.');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  ☦️  Saints Batch Production Agent`);
  console.log(`  Range : Videos ${START_ID} to ${END_ID}`);
  console.log(`  Upload: ${UPLOAD ? 'YES (Private Drafts)' : 'NO (QC / Render Only)'}`);
  console.log('='.repeat(60) + '\n');

  const results = [];

  for (let id = START_ID; id <= END_ID; id++) {
    console.log(`\n=============================================================`);
    console.log(`🎬 Processing SAINTS Video ${id}...`);
    console.log(`=============================================================\n`);

    const agentArgs = [`--video=${id}`];
    if (UPLOAD) {
      agentArgs.push('--upload-private');
    }

    const start = Date.now();
    const runResult = spawnSync(process.execPath, [AUTOPILOT_SCRIPT, ...agentArgs], {
      cwd: SHARED_ROOT,
      stdio: 'inherit',
      encoding: 'utf8',
      env: { ...process.env }
    });
    const durationMin = ((Date.now() - start) / 60000).toFixed(1);

    const success = runResult.status === 0;
    results.push({ id, success, durationMin });

    if (success) {
      console.log(`\n✅ Video ${id} completed successfully in ${durationMin} minutes!`);
    } else {
      console.error(`\n❌ Video ${id} failed after ${durationMin} minutes.`);
      // Check if we should abort or continue
      console.log('Continuing batch processing to next video...');
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Batch Production Summary:`);
  console.log('='.repeat(60));
  results.forEach(r => {
    const status = r.success ? '✅ SUCCESS' : '❌ FAILED';
    console.log(`  Saints Video ${r.id}: ${status} (${r.durationMin} mins)`);
  });
  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('Fatal batch runner error:', err.message);
  process.exit(1);
});
