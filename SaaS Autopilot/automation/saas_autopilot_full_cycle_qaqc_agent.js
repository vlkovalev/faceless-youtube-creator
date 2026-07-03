/**
 * SaaS Autopilot Full-Cycle QA/QC Agent
 * =====================================
 * Runs the per-video QA agent across every generated SaaS Autopilot script file
 * and creates a channel-level rollup report.
 *
 * Usage:
 *   node automation/saas_autopilot_full_cycle_qaqc_agent.js
 *   node automation/saas_autopilot_full_cycle_qaqc_agent.js --skip-video
 *   node automation/saas_autopilot_full_cycle_qaqc_agent.js --dry-run
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_DIR = path.join(__dirname, '..');
const SCRIPTS_DIR = path.join(WORKSPACE_DIR, 'scripts', 'saas_autopilot');
const REPORTS_DIR = path.join(WORKSPACE_DIR, 'metadata', 'qa_reports');
const QA_AGENT = path.join(__dirname, 'saas_autopilot_qa_agent.js');
const YOUTUBE_LINK_QA_AGENT = path.join(__dirname, 'saas_autopilot_youtube_link_qa_agent.js');
const YOUTUBE_CATEGORY_AGENT = path.join(__dirname, 'saas_autopilot_youtube_category_agent.js');
const PDF_MATERIALS_QA_AGENT = path.join(__dirname, 'saas_autopilot_pdf_materials_qa.py');

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true';
const SKIP_VIDEO = args['skip-video'] === true || args['skip-video'] === 'true';

function topicFromScriptFile(fileName) {
  return path.basename(fileName, '_data.json').toUpperCase().replace(/_/g, '-');
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function runQa(topicId) {
  const agentArgs = [QA_AGENT, '--topic', topicId];
  if (DRY_RUN) agentArgs.push('--dry-run');
  if (SKIP_VIDEO) agentArgs.push('--skip-video');

  const result = spawnSync(process.execPath, agentArgs, {
    cwd: WORKSPACE_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
    windowsHide: true
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const scriptId = topicId.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const reportPath = path.join(REPORTS_DIR, `${scriptId}_qa_report.json`);
  const report = readJson(reportPath, {});

  return {
    topic_id: topicId,
    passed: result.status === 0,
    exit_code: result.status,
    report_path: reportPath,
    failures: report.failures || [`QA agent exited with code ${result.status}`],
    warnings: report.warnings || []
  };
}

function runYoutubeLinkQa() {
  const result = spawnSync(process.execPath, [YOUTUBE_LINK_QA_AGENT], {
    cwd: WORKSPACE_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
    windowsHide: true
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const reportPath = path.join(REPORTS_DIR, 'youtube_uploaded_links_qa_report.json');
  const report = readJson(reportPath, {});

  return {
    passed: result.status === 0,
    exit_code: result.status,
    report_path: reportPath,
    summary: report.summary || null
  };
}

function pythonExecutable() {
  const configured = process.env.PYTHON;
  if (configured && fs.existsSync(configured)) return configured;

  const bundled = path.join(
    process.env.USERPROFILE || '',
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'python',
    'python.exe'
  );
  if (fs.existsSync(bundled)) return bundled;
  return 'python';
}

function runPdfMaterialsQa() {
  const result = spawnSync(pythonExecutable(), [PDF_MATERIALS_QA_AGENT], {
    cwd: WORKSPACE_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
    windowsHide: true
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const reportPath = path.join(REPORTS_DIR, 'pdf_materials_qa_report.json');
  const report = readJson(reportPath, {});

  return {
    passed: result.status === 0,
    exit_code: result.status,
    report_path: reportPath,
    summary: report.summary || null
  };
}

function runYoutubeCategoryQa() {
  const result = spawnSync(process.execPath, [YOUTUBE_CATEGORY_AGENT, '--check-only'], {
    cwd: WORKSPACE_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
    windowsHide: true
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const reportPath = path.join(REPORTS_DIR, 'youtube_category_update_report.json');
  const report = readJson(reportPath, {});

  return {
    passed: result.status === 0,
    exit_code: result.status,
    report_path: reportPath,
    summary: report.summary || null,
    required_category_id: report.required_category_id || '26',
    required_category_name: report.required_category_name || 'How-to & Style'
  };
}

function writeMarkdownReport(reportPath, report) {
  const lines = [];
  lines.push('# SaaS Autopilot Full-Cycle QA/QC Report');
  lines.push('');
  lines.push(`Checked at: ${report.checked_at}`);
  lines.push(`Passed: ${report.summary.passed}`);
  lines.push(`Failed: ${report.summary.failed}`);
  lines.push(`Warnings: ${report.summary.warnings}`);
  lines.push(`PDF materials QA: ${report.pdf_materials && report.pdf_materials.passed ? 'PASS' : 'FAIL'}`);
  lines.push(`YouTube links QA: ${report.youtube_links && report.youtube_links.passed ? 'PASS' : report.youtube_links && report.youtube_links.skipped ? 'SKIPPED' : 'FAIL'}`);
  lines.push(`YouTube category QA: ${report.youtube_category && report.youtube_category.passed ? 'PASS' : report.youtube_category && report.youtube_category.skipped ? 'SKIPPED' : 'FAIL'}`);
  lines.push('');
  lines.push('| Topic | Status | Failures | Warnings |');
  lines.push('|---|---|---:|---:|');
  for (const item of report.items) {
    lines.push(`| ${item.topic_id} | ${item.passed ? 'PASS' : 'FAIL'} | ${item.failures.length} | ${item.warnings.length} |`);
  }
  lines.push('');
  for (const item of report.items.filter(i => !i.passed || i.warnings.length)) {
    lines.push(`## ${item.topic_id}`);
    if (item.failures.length) {
      lines.push('');
      lines.push('Failures:');
      for (const failure of item.failures) lines.push(`- ${failure}`);
    }
    if (item.warnings.length) {
      lines.push('');
      lines.push('Warnings:');
      for (const warning of item.warnings) lines.push(`- ${warning}`);
    }
    lines.push('');
  }
  fs.writeFileSync(reportPath, lines.join('\n'));
}

function main() {
  if (!fs.existsSync(SCRIPTS_DIR)) {
    console.error(`Scripts directory not found: ${SCRIPTS_DIR}`);
    process.exit(1);
  }

  const scriptFiles = fs.readdirSync(SCRIPTS_DIR)
    .filter(name => /^saas_\d+_data\.json$/i.test(name))
    .sort();

  if (scriptFiles.length === 0) {
    console.error(`No script metadata files found in ${SCRIPTS_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  console.log(`\nFull-cycle QA/QC: ${scriptFiles.length} item(s)`);
  console.log(`Video check: ${SKIP_VIDEO ? 'skipped' : 'required'}`);
  console.log(`Network link check: ${DRY_RUN ? 'skipped' : 'required'}\n`);

  const items = scriptFiles.map(fileName => runQa(topicFromScriptFile(fileName)));
  const pdf_materials = runPdfMaterialsQa();
  const youtube_links = DRY_RUN ? { skipped: true, reason: 'dry-run' } : runYoutubeLinkQa();
  const youtube_category = DRY_RUN ? { skipped: true, reason: 'dry-run' } : runYoutubeCategoryQa();
  const report = {
    checked_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    skip_video: SKIP_VIDEO,
    summary: {
      total: items.length,
      passed: items.filter(item => item.passed).length,
      failed: items.filter(item => !item.passed).length,
      warnings: items.reduce((sum, item) => sum + item.warnings.length, 0)
    },
    pdf_materials,
    youtube_links,
    youtube_category,
    items
  };

  const jsonPath = path.join(REPORTS_DIR, 'full_cycle_qaqc_report.json');
  const mdPath = path.join(REPORTS_DIR, 'full_cycle_qaqc_report.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeMarkdownReport(mdPath, report);

  console.log('\nFull-cycle QA/QC complete.');
  console.log(`JSON report: ${jsonPath}`);
  console.log(`Markdown report: ${mdPath}`);

  const externalFailures = [pdf_materials, youtube_links, youtube_category]
    .filter(item => item && !item.skipped && item.passed === false);

  if (report.summary.failed > 0 || externalFailures.length > 0) {
    console.error(`\nQA/QC failed: ${report.summary.failed}/${report.summary.total} script item(s) and ${externalFailures.length} channel/material check(s) need fixes.`);
    process.exit(1);
  }
}

main();
