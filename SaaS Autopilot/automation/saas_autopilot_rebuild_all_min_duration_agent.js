/**
 * SaaS Autopilot Rebuild All Minimum Duration Agent
 * =================================================
 * Regenerates every SaaS Autopilot script/video with the current strict demo
 * agents and then runs QA. The QA gate enforces 8+ minutes, instructional
 * quality, and nonblank visuals.
 *
 * Usage:
 *   node automation/saas_autopilot_rebuild_all_min_duration_agent.js
 *   node automation/saas_autopilot_rebuild_all_min_duration_agent.js --from SAAS-016
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_DIR = path.join(__dirname, '..');
const SCRIPTS_DIR = path.join(WORKSPACE_DIR, 'scripts', 'saas_autopilot');
const REPORTS_DIR = path.join(WORKSPACE_DIR, 'metadata', 'qa_reports');
const SCRIPT_AGENT = path.join(__dirname, 'saas_autopilot_script_agent.js');
const TTS = path.join(__dirname, 'saas_autopilot_tts_agent.js');
const EDITOR = path.join(__dirname, 'saas_autopilot_editor_agent.js');
const QA = path.join(__dirname, 'saas_autopilot_qa_agent.js');

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const FROM = args.from ? String(args.from).toUpperCase() : null;
const ONLY = args.only ? String(args.only).toUpperCase().split(',').map(s => s.trim()).filter(Boolean) : null;

function topicFromScriptName(fileName) {
  return path.basename(fileName, '_data.json').toUpperCase().replace(/_/g, '-');
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function runNode(script, scriptArgs) {
  return spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: WORKSPACE_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
    windowsHide: true,
    env: { ...process.env }
  });
}

function main() {
  let topics = fs.readdirSync(SCRIPTS_DIR)
    .filter(name => /^saas_\d+_data\.json$/i.test(name))
    .map(topicFromScriptName)
    .sort();

  if (FROM) topics = topics.filter(topic => topic >= FROM);
  if (ONLY) topics = topics.filter(topic => ONLY.includes(topic));

  const results = [];
  for (const topic of topics) {
    console.log(`\n=== Rebuilding ${topic} ===`);
    const script = runNode(SCRIPT_AGENT, ['--topic', topic]);
    if (script.stdout) process.stdout.write(script.stdout);
    if (script.stderr) process.stderr.write(script.stderr);

    const tts = script.status === 0 ? runNode(TTS, ['--topic', topic]) : { status: 1, stdout: '', stderr: 'Script failed; TTS skipped.' };
    if (tts.stdout) process.stdout.write(tts.stdout);
    if (tts.stderr) process.stderr.write(tts.stderr);

    const edit = tts.status === 0 ? runNode(EDITOR, ['--topic', topic, '--overwrite']) : { status: 1, stdout: '', stderr: 'TTS failed; editor skipped.' };
    if (edit.stdout) process.stdout.write(edit.stdout);
    if (edit.stderr) process.stderr.write(edit.stderr);

    const qa = edit.status === 0 ? runNode(QA, ['--topic', topic, '--dry-run']) : { status: 1, stdout: '', stderr: 'Editor failed; QA skipped.' };
    if (qa.stdout) process.stdout.write(qa.stdout);
    if (qa.stderr) process.stderr.write(qa.stderr);

    const passed = script.status === 0 && tts.status === 0 && edit.status === 0 && qa.status === 0;
    results.push({
      topic_id: topic,
      script_exit_code: script.status,
      tts_exit_code: tts.status,
      editor_exit_code: edit.status,
      qa_exit_code: qa.status,
      passed
    });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${topic}`);
  }

  const report = {
    checked_at: new Date().toISOString(),
    from: FROM,
    only: ONLY,
    summary: {
      total: results.length,
      passed: results.filter(row => row.passed).length,
      failed: results.filter(row => !row.passed).length
    },
    results
  };
  const reportPath = path.join(REPORTS_DIR, 'rebuild_min_duration_report.json');
  writeJson(reportPath, report);
  console.log(`\nReport: ${reportPath}`);
  if (report.summary.failed > 0) process.exit(1);
}

main();
