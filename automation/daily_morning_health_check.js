'use strict';

/**
 * Daily Morning Health Check Coordinator
 *
 * This script runs every morning to:
 * 1. Refresh live YouTube status snapshots for all channels.
 * 2. Sync calendars with YouTube scheduled publish dates.
 * 3. Run the channel health check agent.
 * 4. Run the issue fixer agent for low-risk self-healing actions.
 * 5. Report the consolidated results.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const AUTOMATION_DIR = __dirname;
const META_DIR = path.join(ROOT, 'metadata');
const REPORT_JSON = path.join(META_DIR, 'youtube_health_check_report.json');

const CHANNELS = ['corporate', 'saints', 'saas_autopilot'];
const MORNING_CHECK_DISABLED = true;

function exitIfDisabled() {
  if (!MORNING_CHECK_DISABLED) return;
  console.log('Daily morning brief/check generation is disabled by user request.');
  process.exit(0);
}

function runNodeScript(scriptName, scriptArgs = []) {
  console.log(`[EXEC] node ${scriptName} ${scriptArgs.join(' ')}`);
  const result = spawnSync(process.execPath, [path.join(AUTOMATION_DIR, scriptName), ...scriptArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    env: { ...process.env }
  });
  return result.status === 0;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

async function main() {
  exitIfDisabled();

  console.log('=====================================================');
  console.log(`🌅 Starting Daily Morning YouTube Health Check Runner`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('=====================================================\n');

  // Step 1: Update live YouTube status snapshots for all channels
  console.log('--- Step 1: Updating Live YouTube Status Snapshots ---');
  for (const channel of CHANNELS) {
    console.log(`Refreshing status snapshot for channel profile: ${channel}...`);
    const ok = runNodeScript('youtube_status_agent.js', [`--channel=${channel}`]);
    if (!ok) {
      console.warn(`⚠️ Warning: Status snapshot failed for channel ${channel}. Proceeding...`);
    }
  }
  console.log('Live snapshots update complete.\n');

  // Step 2: Synchronize local calendars with live scheduled dates
  console.log('--- Step 2: Synchronizing Content Calendars with YouTube ---');
  const calendarOk = runNodeScript('sync_calendar_with_live.js');
  if (!calendarOk) {
    console.warn('⚠️ Warning: Calendar synchronization script returned non-zero status.');
  }
  console.log('Calendar sync complete.\n');

  // Step 3: Run the Health Check Agent
  console.log('--- Step 3: Running YouTube Health Check Agent ---');
  const healthOk = runNodeScript('youtube_health_check_agent.js');
  console.log('Health check complete.\n');

  // Step 4: Run the Issue Fixer Agent
  console.log('--- Step 4: Running Issue Fixer Agent ---');
  const fixerOk = runNodeScript('issue_fixer_agent.js');
  if (!fixerOk) {
    console.warn('Warning: Issue fixer agent returned non-zero status. Review metadata/issue_fixer_report.json.');
  }
  console.log('Issue fixer pass complete.\n');

  // Step 5: Analyze and output status
  const report = readJson(REPORT_JSON, null);
  if (!report) {
    console.error('❌ Error: Health check report JSON was not found at metadata/youtube_health_check_report.json');
    process.exit(1);
  }

  console.log('=====================================================');
  console.log(`📊 Morning Health Summary: ${report.overall_status}`);
  console.log(`Channels Checked: ${report.channels_checked}`);
  console.log(`Total Issues: ${report.total_issues}`);
  console.log(`- Critical: ${report.issue_counts.Critical || 0}`);
  console.log(`- Red: ${report.issue_counts.Red || 0}`);
  console.log(`- Yellow: ${report.issue_counts.Yellow || 0}`);
  console.log('=====================================================\n');

  if (report.issues && report.issues.length) {
    console.log('📋 Active Issues and Actions Required:');
    for (const issue of report.issues) {
      console.log(`[${issue.severity}] [${issue.channel_name}] ${issue.summary}`);
      console.log(`   Action Required: ${issue.action_required}`);
      console.log(`   Owner: ${issue.owner} | Deadline: ${issue.deadline || 'none'}\n`);
    }
  } else {
    console.log('💚 All channels are perfectly healthy. No issues detected!');
  }

  // Set appropriate exit code
  if (report.overall_status === 'Critical' || report.overall_status === 'Red') {
    console.log('❌ Morning health check finished with unresolved critical/red issues.');
    process.exitCode = 1;
  } else {
    console.log('✅ Morning health check finished successfully.');
    process.exitCode = 0;
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Unhandled failure in morning health check:', err);
    process.exit(1);
  });
}
