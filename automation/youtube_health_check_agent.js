'use strict';

const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT,
  SAINTS_ROOT,
  SAAS_AUTOMATION_ROOT
} = require('./channel_paths');

const ROOT = REPO_ROOT;
const OUTPUT_DIR = path.join(ROOT, 'metadata');
const REPORT_JSON = path.join(OUTPUT_DIR, 'youtube_health_check_report.json');
const REPORT_MD = path.join(OUTPUT_DIR, 'youtube_health_check_report.md');
const ISSUES_JSON = path.join(OUTPUT_DIR, 'youtube_health_check_issues.json');

const args = parseArgs(process.argv.slice(2));
const requestedChannel = normalizeChannelKey(args.channel || '');
const now = new Date();

const CHANNELS = {
  corporate: {
    key: 'corporate',
    name: 'Corporate Shadows',
    owner: 'Corporate Shadows Production Lead',
    statusFile: path.join(ROOT, 'Corporate Shadows', 'metadata', 'youtube_channel_status.json'),
    trackerFile: path.join(ROOT, 'Corporate Shadows', 'metadata', 'uploads_tracker.json'),
    calendarFile: path.join(ROOT, 'metadata', 'content_calendar.json'),
    delayReportFile: null,
    requiredQueueDays: 5
  },
  saints: {
    key: 'saints',
    name: 'The Saints',
    owner: 'The Saints Production Lead',
    statusFile: path.join(ROOT, 'The Saints', 'metadata', 'youtube_channel_status_saints.json'),
    trackerFile: path.join(ROOT, 'The Saints', 'metadata', 'uploads_tracker.json'),
    calendarFile: path.join(ROOT, 'The Saints', 'metadata', 'next_slate.json'),
    delayReportFile: null,
    requiredQueueDays: 5
  },
  saas_autopilot: {
    key: 'saas_autopilot',
    name: 'SaaS Autopilot',
    owner: 'SaaS Autopilot Systems Lead',
    statusFile: path.join(SAAS_AUTOMATION_ROOT, 'metadata', 'youtube_channel_status_saas_autopilot.json'),
    trackerFile: path.join(SAAS_AUTOMATION_ROOT, 'metadata', 'uploads_tracker.json'),
    calendarFile: path.join(SAAS_AUTOMATION_ROOT, 'metadata', 'canonical_slate.json'),
    delayReportFile: path.join(SAAS_AUTOMATION_ROOT, 'metadata', 'publish_delay_report.json'),
    requiredQueueDays: 7
  }
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    if (rest.length) {
      out[key] = rest.join('=');
    } else {
      const next = argv[i + 1];
      out[key] = next && !next.startsWith('--') ? argv[++i] : true;
    }
  }
  return out;
}

function normalizeChannelKey(value) {
  const normalized = String(value || '').toLowerCase().replace(/[-\s]+/g, '_');
  if (!normalized) return '';
  if (['cs', 'corporate', 'corporate_shadows'].includes(normalized)) return 'corporate';
  if (['saints', 'the_saints'].includes(normalized)) return 'saints';
  if (['saas_autopilot', 'saasautopilot', 'saas_automation', 'saasautomation', 'saas', 'saas_autopilot', 'saas_autopilot'].includes(normalized)) {
    return 'saas_autopilot';
  }
  return normalized;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function fileAgeHours(filePath) {
  if (!fs.existsSync(filePath)) return Number.POSITIVE_INFINITY;
  const stat = fs.statSync(filePath);
  return (Date.now() - stat.mtimeMs) / 3600000;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function summarizeSeverity(levels) {
  if (levels.includes('Critical')) return 'Critical';
  if (levels.includes('Red')) return 'Red';
  if (levels.includes('Yellow')) return 'Yellow';
  return 'Green';
}

function createIssue(channel, severity, code, summary, details, action, deadlineHours = null) {
  const detectedAt = new Date().toISOString();
  const deadline = deadlineHours === null ? null : new Date(Date.now() + deadlineHours * 3600000).toISOString();
  return {
    channel_key: channel.key,
    channel_name: channel.name,
    owner: channel.owner,
    severity,
    code,
    summary,
    details,
    action_required: action,
    detected_at: detectedAt,
    deadline
  };
}

function buildLiveVideoMap(status) {
  const map = new Map();
  for (const video of Array.isArray(status && status.videos) ? status.videos : []) {
    if (video && video.youtube_id) map.set(String(video.youtube_id), video);
  }
  return map;
}

function getTrackerEntries(channel, tracker) {
  const uploadedFiles = tracker && tracker.uploaded_files ? tracker.uploaded_files : {};
  let entries = Object.entries(uploadedFiles).map(([filename, record]) => ({ filename, ...record }));

  // Exclude non-canonical and superseded entries to avoid false positives on retired drafts
  entries = entries.filter(entry => entry.canonical !== false && !entry.superseded_by);

  if (channel.key === 'saas_autopilot') {
    return entries.filter(entry => normalizeChannelKey(entry.channel) === 'saas_autopilot' || /^SAAS_/i.test(entry.filename));
  }
  if (channel.key === 'saints') {
    return entries.filter(entry =>
      String(entry.channel || '').toLowerCase().includes('saints') ||
      /^SAINTS_/i.test(entry.filename) ||
      String(entry.script_id || '').toLowerCase().startsWith('saints')
    );
  }
  return entries.filter(entry => {
    const normalized = String(entry.channel || '').toLowerCase();
    return !normalized || normalized === 'corporate_shadows' || normalized === 'corporate';
  });
}

function getScheduledEntries(channel, trackerEntries) {
  return trackerEntries.filter(entry => toDate(entry.publish_at));
}

function assessChannel(channel) {
  const issues = [];
  const status = readJson(channel.statusFile, null);
  const tracker = readJson(channel.trackerFile, { uploaded_files: {} });
  const delayReport = channel.delayReportFile ? readJson(channel.delayReportFile, null) : null;
  const liveVideos = buildLiveVideoMap(status);
  const trackerEntries = getTrackerEntries(channel, tracker);
  const scheduledEntries = getScheduledEntries(channel, trackerEntries).sort((a, b) => {
    return new Date(a.publish_at).getTime() - new Date(b.publish_at).getTime();
  });
  const statusSyncedAt = toDate(status && status.synced_at);
  const statusSyncedMs = statusSyncedAt ? statusSyncedAt.getTime() : 0;
  const newerThanSnapshotEntries = statusSyncedMs
    ? trackerEntries.filter(entry => {
        const uploadedAt = toDate(entry.uploaded_at);
        return uploadedAt && uploadedAt.getTime() > statusSyncedMs;
      })
    : [];
  const newerThanSnapshotIds = new Set(newerThanSnapshotEntries.map(entry => String(entry.youtube_id || '')));

  if (!status) {
    issues.push(createIssue(
      channel,
      'Critical',
      'missing_status_file',
      'Missing live YouTube status snapshot',
      `Status file not found: ${channel.statusFile}`,
      'Run youtube_status_agent.js for this channel immediately.',
      1
    ));
  } else {
    const ageHours = fileAgeHours(channel.statusFile);
    if (ageHours > 36) {
      issues.push(createIssue(
        channel,
        'Red',
        'stale_status_snapshot',
        'Live YouTube status snapshot is stale',
        `${channel.statusFile} is ${ageHours.toFixed(1)} hours old.`,
        'Refresh the channel snapshot before trusting publish state.',
        2
      ));
    }
  }

  if (status && newerThanSnapshotEntries.length) {
    issues.push(createIssue(
      channel,
      'Yellow',
      'status_snapshot_older_than_tracker',
      `Latest live snapshot predates ${newerThanSnapshotEntries.length} tracker upload(s)`,
      `${channel.statusFile} synced at ${status.synced_at}, but ${newerThanSnapshotEntries.length} canonical tracker entries were uploaded later.`,
      'Treat tracker/live mismatches for those newer uploads as pending until YouTube status sync can refresh.',
      12
    ));
  }

  if (!trackerEntries.length) {
    issues.push(createIssue(
      channel,
      'Critical',
      'missing_tracker_entries',
      'No tracker entries found for channel',
      `Tracker file ${channel.trackerFile} contains no channel entries.`,
      'Restore or rebuild uploads tracker for this channel.',
      2
    ));
  }

  if (delayReport && Array.isArray(delayReport.delayed_videos) && delayReport.delayed_videos.length) {
    for (const item of delayReport.delayed_videos) {
      issues.push(createIssue(
        channel,
        'Critical',
        'publish_delay_detected',
        `Delayed publish detected for ${item.youtube_id || item.filename}`,
        `${item.title || 'Untitled'} is overdue by ${item.minutes_overdue || '?'} minutes; live status is ${item.live_privacy_status || 'unknown'}.`,
        'Verify live publish state and correct the schedule or privacy status now.',
        1
      ));
    }
  }

  for (const entry of trackerEntries) {
    if (!entry.youtube_id) {
      issues.push(createIssue(
        channel,
        'Red',
        'missing_youtube_id',
        `Tracker entry missing YouTube ID for ${entry.filename}`,
        `Tracker record has no youtube_id in ${channel.trackerFile}.`,
        'Repair tracker record and reconcile it against YouTube.',
        4
      ));
      continue;
    }

    const live = liveVideos.get(String(entry.youtube_id));
    if (!live && status) {
      if (newerThanSnapshotIds.has(String(entry.youtube_id))) {
        continue;
      }
      issues.push(createIssue(
        channel,
        'Red',
        'tracker_not_in_live_status',
        `Tracked video ${entry.youtube_id} not present in latest live snapshot`,
        `${entry.filename} exists in tracker but was not returned by the live status pull.`,
        'Refresh status sync and verify channel/token alignment.',
        4
      ));
      continue;
    }

    const scheduledAt = toDate(entry.publish_at);
    if (scheduledAt && scheduledAt.getTime() < now.getTime() && live && String(live.privacy_status || '').toLowerCase() !== 'public') {
      issues.push(createIssue(
        channel,
        'Critical',
        'scheduled_video_not_public',
        `Scheduled video still not public: ${entry.youtube_id}`,
        `${entry.title || entry.filename} was scheduled for ${entry.publish_at} but is still ${live.privacy_status}.`,
        'Fix publish state or reschedule the video immediately.',
        1
      ));
    }
  }

  const futureScheduled = scheduledEntries.filter(entry => {
    const date = toDate(entry.publish_at);
    return date && date.getTime() > now.getTime();
  });

  const gateStatusFile = path.join(ROOT, 'metadata', 'channel_gate_status.json');
  const gateStatus = readJson(gateStatusFile, null);
  let isImmediatePublish = false;
  if (gateStatus) {
    const gateKey = channel.key === 'corporate' ? 'corporate_shadows_gate' : `${channel.key}_gate`;
    const gate = gateStatus[gateKey] || gateStatus[channel.key.toUpperCase() + '_gate'];
    if (gate && (gate.earliest_publish === 'immediate' || (gate.required_before_publish && String(gate.required_before_publish).includes('publish immediately')))) {
      isImmediatePublish = true;
    }
  }
  if (channel.key === 'saints' || channel.key === 'saas_autopilot') {
    isImmediatePublish = true;
  }

  if (!isImmediatePublish) {
    if (!futureScheduled.length) {
      issues.push(createIssue(
        channel,
        channel.key === 'saas_autopilot' ? 'Yellow' : 'Yellow',
        'no_future_scheduled_videos',
        'No future scheduled videos found in tracker',
        `No tracker entries have a future publish_at value for ${channel.name}.`,
        'Schedule the next videos and confirm publish timestamps are written back to the tracker.',
        channel.key === 'saas_autopilot' ? 24 : 12
      ));
    } else {
      const nextScheduledAt = toDate(futureScheduled[0].publish_at);
      const daysUntilNext = Math.round((nextScheduledAt.getTime() - now.getTime()) / 86400000);
      if (daysUntilNext > channel.requiredQueueDays) {
        issues.push(createIssue(
          channel,
          'Yellow',
          'thin_schedule_coverage',
          'Next scheduled video is too far out',
          `The next scheduled video for ${channel.name} is ${daysUntilNext} day(s) away.`,
          'Fill the near-term publish queue to protect channel cadence.',
          24
        ));
      }
    }
  }

  const channelSummary = {
    channel_key: channel.key,
    channel_name: channel.name,
    owner: channel.owner,
    status_snapshot_age_hours: Number.isFinite(fileAgeHours(channel.statusFile)) ? Number(fileAgeHours(channel.statusFile).toFixed(1)) : null,
    tracker_entries: trackerEntries.length,
    scheduled_entries: scheduledEntries.length,
    live_video_count: status && status.channel ? Number(status.channel.video_count || 0) : 0,
    live_view_count: status && status.channel ? Number(status.channel.view_count || 0) : 0,
    live_subscriber_count: status && status.channel ? Number(status.channel.subscriber_count || 0) : 0,
    next_scheduled_publish_at: futureScheduled[0] ? futureScheduled[0].publish_at : null,
    issues
  };

  channelSummary.overall_status = summarizeSeverity(issues.map(issue => issue.severity));
  return channelSummary;
}

function buildReport(channelSummaries) {
  const issues = channelSummaries.flatMap(channel => channel.issues);
  const overallStatus = summarizeSeverity(channelSummaries.map(channel => channel.overall_status));

  return {
    generated_at: now.toISOString(),
    overall_status: overallStatus,
    channels_checked: channelSummaries.length,
    total_issues: issues.length,
    issue_counts: {
      Green: channelSummaries.filter(channel => channel.overall_status === 'Green').length,
      Yellow: issues.filter(issue => issue.severity === 'Yellow').length,
      Red: issues.filter(issue => issue.severity === 'Red').length,
      Critical: issues.filter(issue => issue.severity === 'Critical').length
    },
    channels: channelSummaries,
    issues
  };
}

function markdownReport(report) {
  const lines = [
    '# Daily YouTube Health Check Report',
    '',
    `Generated: ${report.generated_at}`,
    `Overall Status: ${report.overall_status}`,
    `Channels Checked: ${report.channels_checked}`,
    `Total Issues: ${report.total_issues}`,
    '',
    '## Channel Status'
  ];

  for (const channel of report.channels) {
    lines.push(`- ${channel.channel_name}: ${channel.overall_status}`);
    lines.push(`  Owner: ${channel.owner}`);
    lines.push(`  Tracker entries: ${channel.tracker_entries} | Scheduled entries: ${channel.scheduled_entries}`);
    lines.push(`  Snapshot age: ${channel.status_snapshot_age_hours === null ? 'missing' : `${channel.status_snapshot_age_hours}h`}`);
    lines.push(`  Next scheduled publish: ${channel.next_scheduled_publish_at || 'none'}`);
    if (!channel.issues.length) {
      lines.push('  Findings: no issues detected.');
    } else {
      for (const issue of channel.issues) {
        lines.push(`  - [${issue.severity}] ${issue.summary}`);
        lines.push(`    Action: ${issue.action_required}`);
      }
    }
  }

  lines.push('', '## Action Items');
  if (!report.issues.length) {
    lines.push('- No action items created.');
  } else {
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity}] ${issue.channel_name} | ${issue.summary} | Owner: ${issue.owner} | Deadline: ${issue.deadline || 'none'}`);
    }
  }

  return lines.join('\n');
}

function main() {
  const selectedChannels = Object.values(CHANNELS).filter(channel => !requestedChannel || channel.key === requestedChannel);
  if (!selectedChannels.length) {
    console.error(`Unknown channel: ${args.channel}`);
    process.exit(1);
  }

  const channelSummaries = selectedChannels.map(assessChannel);
  const report = buildReport(channelSummaries);

  writeJson(REPORT_JSON, report);
  writeJson(ISSUES_JSON, report.issues);
  writeText(REPORT_MD, markdownReport(report));

  console.log(JSON.stringify({
    generated_at: report.generated_at,
    overall_status: report.overall_status,
    channels_checked: report.channels_checked,
    total_issues: report.total_issues,
    report_json: path.relative(ROOT, REPORT_JSON),
    report_md: path.relative(ROOT, REPORT_MD),
    issues_json: path.relative(ROOT, ISSUES_JSON)
  }, null, 2));

  if (report.issues.some(issue => issue.severity === 'Critical' || issue.severity === 'Red')) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
