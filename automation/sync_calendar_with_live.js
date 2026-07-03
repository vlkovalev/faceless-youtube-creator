const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.resolve(__dirname, '..');

// Inputs
const CS_STATUS_FILE = path.join(WORKSPACE_DIR, 'Corporate Shadows', 'metadata', 'youtube_channel_status.json');
const SAINTS_STATUS_FILE = path.join(WORKSPACE_DIR, 'The Saints', 'metadata', 'youtube_channel_status_saints.json');
const SAAS_AUTOPILOT_STATUS_FILE = path.join(WORKSPACE_DIR, 'SaaS Autopilot', 'metadata', 'youtube_channel_status_saas_autopilot.json');

// Channel-specific files to sync. Do not mirror between channel roots.
const CS_CALENDAR_FILE = path.join(WORKSPACE_DIR, 'Corporate Shadows', 'metadata', 'content_calendar.json');
const CS_TRACKER_FILE = path.join(WORKSPACE_DIR, 'Corporate Shadows', 'metadata', 'uploads_tracker.json');
const SAINTS_TRACKER_FILE = path.join(WORKSPACE_DIR, 'The Saints', 'metadata', 'uploads_tracker.json');
const SAAS_AUTOPILOT_TRACKER_FILE = path.join(WORKSPACE_DIR, 'SaaS Autopilot', 'metadata', 'uploads_tracker.json');
const SAAS_AUTOPILOT_DELAY_REPORT_FILE = path.join(WORKSPACE_DIR, 'SaaS Autopilot', 'metadata', 'publish_delay_report.json');
const SAAS_AUTOPILOT_DELAY_REPORT_MD = path.join(WORKSPACE_DIR, 'SaaS Autopilot', 'metadata', 'publish_delay_report.md');

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function safeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildSaasAutopilotDelayReport(tracker, liveVideos) {
  const now = new Date();
  const liveById = {};
  for (const video of liveVideos) {
    if (video && video.youtube_id) {
      liveById[video.youtube_id] = video;
    }
  }

  const delayedVideos = [];
  const uploadedFiles = tracker && tracker.uploaded_files ? tracker.uploaded_files : {};
  for (const [filename, record] of Object.entries(uploadedFiles)) {
    if (String(record.channel || '').toLowerCase() !== 'saas_autopilot') continue;

    const scheduledAt = safeIso(record.publish_at);
    if (!scheduledAt) continue;

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate > now) continue;

    const live = liveById[record.youtube_id] || null;
    const livePrivacy = String(live && live.privacy_status || '').toLowerCase();
    const isPublic = livePrivacy === 'public';

    if (!isPublic) {
      delayedVideos.push({
        filename,
        youtube_id: record.youtube_id,
        title: record.title,
        scheduled_publish_at: scheduledAt,
        minutes_overdue: Math.max(0, Math.floor((now.getTime() - scheduledDate.getTime()) / 60000)),
        live_privacy_status: live ? live.privacy_status : 'missing_live_status',
        last_live_publish_at: live && live.publish_at ? live.publish_at : '',
        status: live ? 'scheduled_time_passed_not_public' : 'scheduled_time_passed_unverified'
      });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    channel: 'saas_autopilot',
    live_status_file_present: fs.existsSync(SAAS_AUTOPILOT_STATUS_FILE),
    delayed_video_count: delayedVideos.length,
    delayed_videos: delayedVideos
  };
}

function writeSaasAutopilotDelayReport(report) {
  writeJson(SAAS_AUTOPILOT_DELAY_REPORT_FILE, report);
  const lines = [
    '# SaaS Autopilot Publish Delay Report',
    '',
    `Generated: ${report.generated_at}`,
    `Live status file present: ${report.live_status_file_present ? 'yes' : 'no'}`,
    `Delayed videos: ${report.delayed_video_count}`,
    ''
  ];

  if (!report.delayed_videos.length) {
    lines.push('- No overdue scheduled SaaS Autopilot videos detected.');
  } else {
    for (const item of report.delayed_videos) {
      lines.push(`- ${item.youtube_id} | ${item.live_privacy_status} | overdue ${item.minutes_overdue} min | scheduled ${item.scheduled_publish_at} | ${item.title}`);
    }
  }

  fs.mkdirSync(path.dirname(SAAS_AUTOPILOT_DELAY_REPORT_MD), { recursive: true });
  fs.writeFileSync(SAAS_AUTOPILOT_DELAY_REPORT_MD, lines.join('\n'));
}

// Maps titles/topics to Corporate Shadows video IDs (1 to 8)
const CS_VIDEO_MAP = {
  "How One Family Fooled the World into Buying Worthless Rocks": 1,
  "The Poisoned Formula: The Corporate Giant That Stole Africa's Markets": 2,
  "The Secret Society That Controlled the World's Electricity": 3,
  "The Billion-Dollar Poison: How America's Sweetest Brand Fooled a Generation": 4,
  "The Company That Literally Conquered India (and Went Bankrupt)": 5,
  "The Toxic Empire: The Family That Hooked America on Pain": 6,
  "The Silent Killer: How a Chemical Giant Poisoned a Town": 7,
  "The Company That Patented Nature: How a Corporate Giant Controlled the World's Seeds": 8,
  "The Golden Scam: The Man Who Sold a Fake Gold Mine": 10
};

async function main() {
  console.log('ðŸ”„ Syncing content calendars and trackers with live YouTube statuses...\n');

  // Load live data
  const csStatus = readJson(CS_STATUS_FILE);
  const saintsStatus = readJson(SAINTS_STATUS_FILE);
  const saasAutopilotStatus = readJson(SAAS_AUTOPILOT_STATUS_FILE);

  if (!csStatus) {
    console.error('âŒ Missing Corporate Shadows live status file.');
    return;
  }

  // Build map of live CS videos
  const liveCsVideos = {};
  if (csStatus.videos && Array.isArray(csStatus.videos)) {
    for (const v of csStatus.videos) {
      // Try to find matching video number by title
      let scriptId = null;
      for (const [title, id] of Object.entries(CS_VIDEO_MAP)) {
        if (v.title.toLowerCase().includes(title.toLowerCase())) {
          scriptId = id;
          break;
        }
      }
      if (scriptId) {
        liveCsVideos[scriptId] = v;
      }
    }
  }

  console.log(`Matched ${Object.keys(liveCsVideos).length} Corporate Shadows videos from live status.`);

  // 1. Sync content_calendar.json
  const calendar = readJson(CS_CALENDAR_FILE, []);
  if (calendar && Array.isArray(calendar)) {
    for (const item of calendar) {
      if (item.script_id && liveCsVideos[item.script_id]) {
        const live = liveCsVideos[item.script_id];
        item.youtube_video_id = live.youtube_id;
        item.youtube_upload_url = `https://youtu.be/${live.youtube_id}`;
        item.assigned_publish_date = live.publish_at || "";
        item.publish_status = live.privacy_status;
        console.log(`   Updated calendar VID-000${item.script_id}: status=${live.privacy_status}, date=${live.publish_at || 'public'}`);
      }
    }
    writeJson(CS_CALENDAR_FILE, calendar);
    console.log('Synchronized Corporate Shadows metadata/content_calendar.json.\n');
  }

  // 2. Sync Corporate Shadows uploads_tracker.json
  const csTracker = readJson(CS_TRACKER_FILE, { uploaded_files: {} });

  if (csTracker && csTracker.uploaded_files) {
    for (const [scriptId, live] of Object.entries(liveCsVideos)) {
      const filename = `FINAL_VIDEO_${scriptId}_VISUAL_UPGRADE.mp4`;
      const altFilename = `FINAL_VIDEO_${scriptId}_OMNI_FLASH.mp4`;
      
      // Check if it is omni flash in status
      const isOmni = live.youtube_id === '21DRL-iGzBs' || live.youtube_id === 'gPhHnEjKaP8' || live.youtube_id === 'PxBdlAu-hvY' || live.youtube_id === 'CXDTHbQVuPQ';
      const targetFilename = isOmni ? altFilename : filename;

      csTracker.uploaded_files[targetFilename] = {
        youtube_id: live.youtube_id,
        uploaded_at: live.published_at || new Date().toISOString(),
        publish_at: live.publish_at || null,
        title: live.title,
        canonical: true,
        status_note: `CANONICAL. Live synchronized status: ${live.privacy_status}`
      };
      
      // Also write other alternate videos as non-canonical if they exist
      // e.g. for Video 1, 2, 3
      if (scriptId == 1) {
        csTracker.uploaded_files['FINAL_VIDEO_1_VISUAL_UPGRADE.mp4'] = {
          youtube_id: 'FCPe5Dlk_xw',
          uploaded_at: '2026-05-29T21:23:35.000Z',
          publish_at: null,
          title: live.title,
          canonical: false,
          status_note: "Superseded by Omni Flash version"
        };
      } else if (scriptId == 2) {
        csTracker.uploaded_files['FINAL_VIDEO_2_VISUAL_UPGRADE.mp4'] = {
          youtube_id: 'ZloTBQbWyf4',
          uploaded_at: '2026-05-29T22:08:37.000Z',
          publish_at: null,
          title: live.title,
          canonical: false,
          status_note: "Superseded by Omni Flash version"
        };
      } else if (scriptId == 3) {
        csTracker.uploaded_files['FINAL_VIDEO_3_VISUAL_UPGRADE.mp4'] = {
          youtube_id: 'mM0axfPaZBU',
          uploaded_at: '2026-05-29T23:19:01.000Z',
          publish_at: null,
          title: live.title,
          canonical: false,
          status_note: "Superseded by Omni Flash version"
        };
      }
      
      console.log(`   Updated tracker entry for Video ${scriptId} (${targetFilename})`);
    }

    writeJson(CS_TRACKER_FILE, csTracker);
    console.log('âœ… Synchronized Corporate Shadows metadata/uploads_tracker.json.');
  }

  // Sync Saints tracker only inside The Saints project.
  const saintsTracker = readJson(SAINTS_TRACKER_FILE, { uploaded_files: {} });
  if (saintsStatus && saintsStatus.videos && Array.isArray(saintsStatus.videos)) {
    console.log('\nMatching Saints videos from live status...');
    for (const v of saintsStatus.videos) {
      // Find matching saint file in saintsTracker
      if (saintsTracker && saintsTracker.uploaded_files) {
        let matchedKeySub = null;
        for (const [filename, info] of Object.entries(saintsTracker.uploaded_files)) {
          if (info.title === v.title) {
            matchedKeySub = filename;
            break;
          }
        }
        if (matchedKeySub) {
          saintsTracker.uploaded_files[matchedKeySub].youtube_id = v.youtube_id;
          saintsTracker.uploaded_files[matchedKeySub].publish_at = v.publish_at || null;
          console.log(`   Updated Saints tracker video: ${v.title} -> ${v.youtube_id} (${v.privacy_status})`);
        }
      }
    }
    writeJson(SAINTS_TRACKER_FILE, saintsTracker);
    console.log('Synchronized The Saints metadata/uploads_tracker.json with Saints statuses.');
  }

  // Sync SaaS Autopilot tracker from live status and emit overdue publish report.
  const saasAutopilotTracker = readJson(SAAS_AUTOPILOT_TRACKER_FILE, { uploaded_files: {} });
  if (saasAutopilotTracker && saasAutopilotTracker.uploaded_files) {
    const liveSaasAutopilotVideos = saasAutopilotStatus && Array.isArray(saasAutopilotStatus.videos) ? saasAutopilotStatus.videos : [];
    const liveSaasAutopilotById = {};
    for (const video of liveSaasAutopilotVideos) {
      if (video && video.youtube_id) {
        liveSaasAutopilotById[video.youtube_id] = video;
      }
    }

    for (const [filename, record] of Object.entries(saasAutopilotTracker.uploaded_files)) {
      if (String(record.channel || '').toLowerCase() !== 'saas_autopilot') continue;
      const live = liveSaasAutopilotById[record.youtube_id];
      if (!live) continue;

      saasAutopilotTracker.uploaded_files[filename] = {
        ...record,
        publish_at: live.publish_at || record.publish_at || null,
        status_note: `CANONICAL. Live synchronized status: ${live.privacy_status}`
      };
      console.log(`   Updated SaaS Autopilot tracker entry for ${record.youtube_id} (${live.privacy_status})`);
    }

    writeJson(SAAS_AUTOPILOT_TRACKER_FILE, saasAutopilotTracker);
    console.log('âœ… Synchronized SaaS Autopilot metadata/uploads_tracker.json.');

    const delayReport = buildSaasAutopilotDelayReport(saasAutopilotTracker, liveSaasAutopilotVideos);
    writeSaasAutopilotDelayReport(delayReport);
    console.log(`âœ… Wrote SaaS Autopilot publish delay report with ${delayReport.delayed_video_count} delayed video(s).`);
  }

  console.log('\nðŸŽ‰ Calendar and uploads tracker synchronization complete!');
}

main().catch(console.error);


