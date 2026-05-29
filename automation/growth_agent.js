const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '..');
const CONFIG_FILE = path.join(WORKSPACE_DIR, 'channel_config.json');
const QUEUE_FILE = path.join(WORKSPACE_DIR, 'metadata', 'queue.json');
const REPORT_FILE = path.join(WORKSPACE_DIR, 'metadata', 'growth_report.json');
const RECOMMENDATIONS_FILE = path.join(WORKSPACE_DIR, 'metadata', 'growth_recommendations.json');
const ANALYTICS_FILE = path.join(WORKSPACE_DIR, 'metadata', 'youtube_analytics_status.json');
const CHANNEL_STATUS_FILE = path.join(WORKSPACE_DIR, 'metadata', 'youtube_channel_status.json');

const MIN_IMPRESSIONS_FOR_THUMBNAIL_DECISION = 1000;
const CTR_UNDERPERFORM_PCT_POINTS = 2;
const THUMBNAIL_REVIEW_DAYS = 7;
const EARLY_TOPIC_SIGNAL_HOURS = 72;
const RETENTION_FLOOR_PERCENT = 40;
const CHANNEL_VIEWS_DECLINE_THRESHOLD = -20;

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function parsePercent(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value <= 1 ? value * 100 : value;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function ageInDays(dateText, now) {
  if (!dateText) return null;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return null;
  return (now.getTime() - date.getTime()) / 86400000;
}

function ageInHours(dateText, now) {
  const days = ageInDays(dateText, now);
  return days === null ? null : days * 24;
}

function hasChapters(entry) {
  return Array.isArray(entry.chapters) && entry.chapters.length >= 3 && /(^|\n)0:00\s+/.test(entry.description || '');
}

function hasPlaylist(entry, playlistTitle) {
  return Boolean(entry.playlist_id) || entry.playlist_title === playlistTitle;
}

function cadenceOk(entry, cadence) {
  const expectedDays = cadence.days || ['Tuesday', 'Friday'];
  const days = entry.publish_days || [];
  return expectedDays.every(day => days.includes(day)) && entry.publish_time === (cadence.time || '10:00');
}

function thumbnailRecord(entry) {
  return {
    filename: entry.filename,
    title: entry.title,
    target_ctr: entry.thumbnail_test && entry.thumbnail_test.target_ctr ? entry.thumbnail_test.target_ctr : '',
    actual_ctr: entry.thumbnail_test && entry.thumbnail_test.actual_ctr ? entry.thumbnail_test.actual_ctr : '',
    first_30s_retention: entry.thumbnail_test && entry.thumbnail_test.retention_first_30s ? entry.thumbnail_test.retention_first_30s : '',
    decision: entry.thumbnail_test && entry.thumbnail_test.decision ? entry.thumbnail_test.decision : 'measure after public release'
  };
}

function inferVideoId(filename) {
  const match = String(filename || '').match(/FINAL_VIDEO_(\d+)/);
  return match ? match[1] : '';
}

function findAnalyticsForEntry(entry, analytics, channelStatus) {
  const candidates = analytics.videos || analytics.video_metrics || [];
  const byFilename = candidates.find(item => item.filename === entry.filename);
  if (byFilename) return byFilename;

  const knownVideos = channelStatus.videos || [];
  const byTitle = knownVideos.find(video => video.title === entry.title);
  if (byTitle) {
    return candidates.find(item => item.youtube_id === byTitle.youtube_id || item.video_id === byTitle.youtube_id) || {
      youtube_id: byTitle.youtube_id,
      published_at: byTitle.published_at,
      views: byTitle.view_count
    };
  }

  return {};
}

function topicForEntry(entry, config) {
  const id = inferVideoId(entry.filename);
  const idea = (config.viral_ideas || []).find(item => String(item.id) === String(id));
  return idea ? {
    id: idea.id,
    title: idea.title,
    topic: idea.topic,
    ctr_angle: idea.ctr_angle,
    target_ctr: idea.target_ctr
  } : { title: entry.title, target_ctr: entry.thumbnail_test && entry.thumbnail_test.target_ctr };
}

function addRecommendation(recommendations, rec) {
  recommendations.push({
    id: `${rec.type}:${rec.video_id || rec.filename || rec.scope}:${recommendations.length + 1}`,
    created_at: new Date().toISOString(),
    status: 'open',
    ...rec
  });
}

function buildRecommendations({ config, queue, analytics, channelStatus }) {
  const now = new Date();
  const recommendations = [];
  const corporate = queue.filter(entry => /^FINAL_VIDEO_\d/.test(entry.filename));

  for (const entry of corporate) {
    const metrics = findAnalyticsForEntry(entry, analytics, channelStatus);
    const topic = topicForEntry(entry, config);
    const impressions = parseNumber(metrics.impressions);
    const actualCtr = parsePercent(metrics.impressionsClickThroughRate ?? metrics.ctr ?? (entry.thumbnail_test && entry.thumbnail_test.actual_ctr));
    const targetCtr = parsePercent(topic.target_ctr || (entry.thumbnail_test && entry.thumbnail_test.target_ctr));
    const avgViewPct = parsePercent(metrics.averageViewPercentage ?? metrics.average_view_percentage);
    const first30 = parsePercent(metrics.first30SecondRetention ?? metrics.first_30s_retention ?? (entry.thumbnail_test && entry.thumbnail_test.retention_first_30s));
    const publishedAt = metrics.published_at || metrics.publishedAt || metrics.publish_at;
    const videoAgeDays = ageInDays(publishedAt, now);
    const videoAgeHours = ageInHours(publishedAt, now);
    const videoId = metrics.youtube_id || metrics.video_id || inferVideoId(entry.filename);

    if (impressions !== null && actualCtr !== null && targetCtr !== null) {
      const delta = actualCtr - targetCtr;
      if (impressions >= MIN_IMPRESSIONS_FOR_THUMBNAIL_DECISION && delta <= -CTR_UNDERPERFORM_PCT_POINTS && (videoAgeDays === null || videoAgeDays >= THUMBNAIL_REVIEW_DAYS)) {
        addRecommendation(recommendations, {
          type: 'thumbnail_replace',
          priority: 'P1',
          filename: entry.filename,
          video_id: videoId,
          title: entry.title,
          reason: `CTR ${actualCtr.toFixed(1)}% is ${Math.abs(delta).toFixed(1)} percentage points below target after ${impressions} impressions.`,
          evidence: { impressions, actual_ctr: actualCtr, target_ctr: targetCtr, age_days: videoAgeDays },
          action: 'Create 2 new thumbnail variants and one tighter title variant; do not change topic or script yet.'
        });
      }
    }

    if (avgViewPct !== null && avgViewPct < RETENTION_FLOOR_PERCENT) {
      const likelyCause = first30 !== null && first30 < RETENTION_FLOOR_PERCENT ? 'hook_failed' : 'mid_video_dead_scene';
      addRecommendation(recommendations, {
        type: likelyCause === 'hook_failed' ? 'hook_rewrite' : 'retention_scene_audit',
        priority: 'P1',
        filename: entry.filename,
        video_id: videoId,
        title: entry.title,
        reason: `Average view percentage ${avgViewPct.toFixed(1)}% is below the ${RETENTION_FLOOR_PERCENT}% floor.`,
        evidence: { average_view_percentage: avgViewPct, first_30s_retention: first30 },
        action: likelyCause === 'hook_failed'
          ? 'Rewrite the first 30 seconds and thumbnail/title promise before making more videos in this exact pattern.'
          : 'Pull minute-by-minute retention when available and identify the scene where viewers leave.'
      });
    }

    if (impressions !== null && actualCtr !== null && targetCtr !== null && videoAgeHours !== null && videoAgeHours <= EARLY_TOPIC_SIGNAL_HOURS && actualCtr >= targetCtr + CTR_UNDERPERFORM_PCT_POINTS) {
      addRecommendation(recommendations, {
        type: 'topic_promote',
        priority: 'P2',
        filename: entry.filename,
        video_id: videoId,
        title: entry.title,
        reason: `Early CTR ${actualCtr.toFixed(1)}% is more than ${CTR_UNDERPERFORM_PCT_POINTS} points above target in the first ${EARLY_TOPIC_SIGNAL_HOURS} hours.`,
        evidence: { actual_ctr: actualCtr, target_ctr: targetCtr, age_hours: videoAgeHours, topic },
        action: 'Move the closest related topic up the production queue and reuse the same emotional angle.'
      });
    }
  }

  const channelTrend = analytics.channel_trend || analytics.channel || {};
  const viewsPerDayChange = parsePercent(channelTrend.views_per_day_change_pct ?? channelTrend.viewsPerDayChangePct);
  const lastPublishedAt = channelTrend.last_published_at || channelTrend.lastPublishedAt;
  const daysSincePublish = ageInDays(lastPublishedAt, now);
  const cadence = (config.growth_system && config.growth_system.publishing_cadence) || { days: ['Tuesday', 'Friday'] };

  if (viewsPerDayChange !== null && viewsPerDayChange <= CHANNEL_VIEWS_DECLINE_THRESHOLD && (daysSincePublish === null || daysSincePublish > 4)) {
    addRecommendation(recommendations, {
      type: 'cadence_gap',
      priority: 'P2',
      scope: 'channel',
      reason: `Channel views/day are down ${Math.abs(viewsPerDayChange).toFixed(1)}% and the last publish is ${daysSincePublish === null ? 'unknown' : daysSincePublish.toFixed(1)} days old.`,
      evidence: { views_per_day_change_pct: viewsPerDayChange, days_since_publish: daysSincePublish, cadence_days: cadence.days },
      action: 'Treat this as a publishing gap before blaming thumbnails or topic quality. Restore Tuesday/Friday cadence.'
    });
  }

  return recommendations.sort((a, b) => String(a.priority).localeCompare(String(b.priority)) || String(a.type).localeCompare(String(b.type)));
}

function run() {
  const config = readJson(CONFIG_FILE, {});
  const growth = config.growth_system || {};
  const playlist = growth.primary_playlist || { title: 'Dark Business Empires' };
  const cadence = growth.publishing_cadence || { days: ['Tuesday', 'Friday'], time: '10:00' };
  const queue = readJson(QUEUE_FILE, []);
  const analytics = readJson(ANALYTICS_FILE, { videos: [], channel_trend: {} });
  const channelStatus = readJson(CHANNEL_STATUS_FILE, { videos: [] });
  const corporate = queue.filter(entry => /^FINAL_VIDEO_\d/.test(entry.filename));

  const checks = corporate.map(entry => ({
    filename: entry.filename,
    title: entry.title,
    playlist_ready: hasPlaylist(entry, playlist.title),
    playlist_id_present: Boolean(entry.playlist_id),
    chapters_ready: hasChapters(entry),
    cadence_ready: cadenceOk(entry, cadence),
    thumbnail_tracking_ready: Boolean(entry.thumbnail_test),
    public_release_gate: entry.human_approval ? 'approval required' : 'not gated'
  }));

  const blockers = [];
  for (const check of checks) {
    if (!check.chapters_ready) blockers.push(`${check.filename}: missing chapters in description`);
    if (!check.playlist_ready) blockers.push(`${check.filename}: missing playlist target`);
    if (!check.cadence_ready) blockers.push(`${check.filename}: cadence is not ${cadence.days.join('/')} ${cadence.time}`);
    if (!check.thumbnail_tracking_ready) blockers.push(`${check.filename}: missing thumbnail tracking fields`);
  }

  const recommendations = buildRecommendations({ config, queue, analytics, channelStatus });
  const recommendationPackage = {
    generated_at: new Date().toISOString(),
    source_files: {
      queue: 'metadata/queue.json',
      analytics: fs.existsSync(ANALYTICS_FILE) ? 'metadata/youtube_analytics_status.json' : 'pending YouTube Analytics API sync',
      channel_status: fs.existsSync(CHANNEL_STATUS_FILE) ? 'metadata/youtube_channel_status.json' : 'pending YouTube Data API sync'
    },
    decision_rules: {
      thumbnail_replace: `>=${MIN_IMPRESSIONS_FOR_THUMBNAIL_DECISION} impressions, age >= ${THUMBNAIL_REVIEW_DAYS} days, CTR at least ${CTR_UNDERPERFORM_PCT_POINTS} percentage points below target`,
      retention_floor: `averageViewPercentage below ${RETENTION_FLOOR_PERCENT}% triggers hook or scene audit`,
      topic_promote: `CTR at least ${CTR_UNDERPERFORM_PCT_POINTS} percentage points above target in first ${EARLY_TOPIC_SIGNAL_HOURS} hours`,
      cadence_gap: `channel views/day down ${Math.abs(CHANNEL_VIEWS_DECLINE_THRESHOLD)}% with publish gap above 4 days`
    },
    summary: {
      recommendations_open: recommendations.length,
      analytics_available: fs.existsSync(ANALYTICS_FILE),
      note: recommendations.length ? 'Act on P1 items before producing adjacent videos.' : 'No metric-based growth actions yet; wait for public videos and Analytics data.'
    },
    recommendations
  };

  const report = {
    generated_at: new Date().toISOString(),
    channel: config.channel && config.channel.name ? config.channel.name : 'Corporate Shadows',
    primary_playlist: playlist,
    publishing_cadence: cadence,
    summary: {
      videos_checked: checks.length,
      blockers: blockers.length,
      playlist_id_pending: checks.filter(check => !check.playlist_id_present).length,
      ready_for_distribution_sprint: blockers.length === 0,
      recommendations_open: recommendations.length
    },
    checks,
    thumbnail_tracking: corporate.map(thumbnailRecord),
    next_actions: [
      'Create or identify the YouTube playlist Dark Business Empires and fill growth_system.primary_playlist.youtube_playlist_id.',
      'Regenerate metadata for every video before upload so descriptions include chapters.',
      'After each public release, sync YouTube Analytics API metrics before changing thumbnails or titles.',
      'Keep Tuesday/Friday cadence unless a video has a legal, factual, serious brand-risk, or final-approval blocker.'
    ]
  };

  writeJson(REPORT_FILE, report);
  writeJson(RECOMMENDATIONS_FILE, recommendationPackage);

  console.log(`Growth report written: ${path.relative(WORKSPACE_DIR, REPORT_FILE)}`);
  console.log(`Growth recommendations written: ${path.relative(WORKSPACE_DIR, RECOMMENDATIONS_FILE)}`);
  console.log(`Videos checked: ${report.summary.videos_checked}`);
  console.log(`Blockers: ${report.summary.blockers}`);
  console.log(`Playlist ID pending: ${report.summary.playlist_id_pending}`);
  console.log(`Open recommendations: ${recommendations.length}`);
  if (blockers.length) {
    console.log('\nBlockers:');
    blockers.forEach(blocker => console.log(`- ${blocker}`));
  }
}

run();