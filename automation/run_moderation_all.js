/**
 * run_moderation_all.js
 *
 * Runs comment moderation for all three portfolio channels:
 *   - Corporate Shadows (cs)
 *   - The Saints (saints)
 *   - SaaS Autopilot (saas)
 *
 * Usage:
 *   node automation/run_moderation_all.js [--live]
 *
 * (Note: Use the absolute path to Node if not in system PATH)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const META_DIR = path.join(ROOT, 'metadata');

// Parse arguments
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    acc[key] = (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[++i] : true;
  }
  return acc;
}, {});

const IS_LIVE = args.live === true || args.live === 'true';
const MODE_STR = IS_LIVE ? 'live' : 'dry-run';

const CHANNELS = [
  { id: 'cs', name: 'Corporate Shadows', reportPath: path.join(ROOT, 'metadata', 'comment_moderation_report.json') },
  { id: 'saints', name: 'The Saints', reportPath: path.join(ROOT, 'The Saints', 'metadata', 'comment_moderation_report.json') },
  { id: 'saas', name: 'SaaS Autopilot', reportPath: path.join(ROOT, 'SaaS Autopilot', 'metadata', 'comment_moderation_report.json') }
];

function readJsonFile(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
  } catch (e) {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function run() {
  console.log(`\n=============================================================`);
  console.log(` 💬 Unified Channel Portfolio Comment Moderation Loop`);
  console.log(` Mode: ${MODE_STR.toUpperCase()}`);
  console.log(`=============================================================\n`);

  const results = [];
  const start = new Date();

  for (const channel of CHANNELS) {
    console.log(`⏳ Running moderation for: ${channel.name} (${channel.id.toUpperCase()})...`);
    
    const childArgs = [
      path.join(__dirname, 'comment_moderation_agent.js'),
      '--channel', channel.id
    ];
    if (IS_LIVE) {
      childArgs.push('--live');
    }

    const result = spawnSync(process.execPath, childArgs, {
      cwd: ROOT,
      encoding: 'utf8',
      shell: false,
      windowsHide: true
    });

    const success = result.status === 0;
    const report = success ? readJsonFile(channel.reportPath) : null;

    if (!success) {
      console.error(`❌ [ERROR] failed to run moderation for ${channel.name}`);
      console.error(result.stderr || result.stdout || 'Unknown error');
    } else {
      console.log(`✅ [SUCCESS] Completed for ${channel.name}.`);
      if (report && report.summary) {
        console.log(`   Processed: ${report.summary.comments_processed} | Flagged: ${report.summary.complaints_and_suggestions_flagged}`);
      }
    }

    results.push({
      channel_id: channel.id,
      channel_name: channel.name,
      success,
      report,
      exit_code: result.status
    });
  }

  // Create aggregated report
  const aggregatedReport = {
    generated_at: new Date().toISOString(),
    duration_ms: new Date() - start,
    mode: MODE_STR,
    summary: {
      channels_run: results.length,
      successful_channels: results.filter(r => r.success).length,
      failed_channels: results.filter(r => !r.success).length,
      total_comments_processed: results.reduce((acc, r) => acc + (r.report ? r.report.summary.comments_processed : 0), 0),
      total_flagged_comments: results.reduce((acc, r) => acc + (r.report ? r.report.summary.complaints_and_suggestions_flagged : 0), 0)
    },
    channels: results
  };

  const aggReportJsonPath = path.join(META_DIR, 'portfolio_comment_moderation_report.json');
  const aggReportMdPath = path.join(META_DIR, 'portfolio_comment_moderation_report.md');

  writeJsonFile(aggReportJsonPath, aggregatedReport);

  // Build markdown report
  const mdLines = [
    `# 💬 Portfolio Comment Moderation Dashboard`,
    `*Generated: ${aggregatedReport.generated_at}*`,
    `*Mode: ${aggregatedReport.mode.toUpperCase()}*`,
    '',
    `## 📊 Executive Summary`,
    `- **Total Comments Processed**: ${aggregatedReport.summary.total_comments_processed}`,
    `- **Actionable Comments Flagged**: ${aggregatedReport.summary.total_flagged_comments}`,
    `- **Success Rate**: ${aggregatedReport.summary.successful_channels} / ${aggregatedReport.summary.channels_run} channels completed`,
    '',
    `## 📺 Channel Breakdown`,
    ''
  ];

  for (const res of results) {
    mdLines.push(`### 🔹 ${res.channel_name} (${res.channel_id.toUpperCase()})`);
    if (!res.success) {
      mdLines.push(`- **Status**: ❌ Execution Failed (Exit Code: ${res.exit_code})`);
      mdLines.push('');
      continue;
    }

    const summary = res.report ? res.report.summary : { comments_processed: 0, complaints_and_suggestions_flagged: 0 };
    mdLines.push(`- **Status**: ✅ Completed Successfully`);
    mdLines.push(`- **Comments Checked**: ${summary.comments_processed}`);
    mdLines.push(`- **Flagged Comments**: ${summary.complaints_and_suggestions_flagged}`);

    if (res.report && res.report.flagged && res.report.flagged.length > 0) {
      mdLines.push(`- **🚨 Flagged items requiring attention:**`);
      for (const f of res.report.flagged) {
        mdLines.push(`  - **@${f.author}**: "${f.comment}" (Category: *${f.category}*)`);
        mdLines.push(`    - *Reason*: ${f.flagged_reason}`);
        mdLines.push(`    - *Drafted Reply*: *"${f.reply_draft}"*`);
        mdLines.push(`    - *Publish Status*: ${f.status === 'replied' ? '✅ Live Posted' : '⏳ Dry-run (Simulated)'}`);
      }
    } else {
      mdLines.push(`- *No complaints or suggestions flagged.*`);
    }
    mdLines.push('');
  }

  mdLines.push(`---`);
  mdLines.push(`*Run \`node automation/run_moderation_all.js --live\` to run live reply posting across the portfolio.*`);

  fs.writeFileSync(aggReportMdPath, mdLines.join('\n'));

  console.log(`\n=============================================================`);
  console.log(` 📊 Unified Portfolio Report Generated`);
  console.log(` JSON: metadata/portfolio_comment_moderation_report.json`);
  console.log(` Markdown: metadata/portfolio_comment_moderation_report.md`);
  console.log(`=============================================================\n`);

  if (aggregatedReport.summary.total_flagged_comments > 0) {
    console.log(`🚨 ACTION REQUIRED: ${aggregatedReport.summary.total_flagged_comments} comments flagged for review!`);
  }
}

run();
