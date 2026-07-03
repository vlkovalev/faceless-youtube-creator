const fs = require('fs');
const path = require('path');

const MIN_IMPRESSIONS_FOR_THUMBNAIL_DECISION = 1000;
const CTR_UNDERPERFORM_PCT_POINTS = 2;
const THUMBNAIL_REVIEW_DAYS = 7;
const EARLY_TOPIC_SIGNAL_HOURS = 72;
const RETENTION_FLOOR_PERCENT = 40;
const CHANNEL_VIEWS_DECLINE_THRESHOLD = -20;
const DEFAULT_ANALYTICS_TRIGGER_PUBLIC_VIDEOS = 3;
const SCRIPTABLE_STATUSES = new Set(['Script & Storyboard Ready', 'Drafting', 'Staged / Scheduled']);

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function exists(filePath) {
  return fs.existsSync(filePath);
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

function inferScriptId(value) {
  const match = String(value || '').match(/(?:VID-|FINAL_VIDEO_)(\d+)/i);
  return match ? Number(match[1]) : null;
}

function formatVideoId(scriptId) {
  return `VID-${String(scriptId).padStart(4, '0')}`;
}

function hasChapters(entry) {
  return Array.isArray(entry?.chapters) && entry.chapters.length >= 3 && /(^|\n)0:00\s+/.test(entry.description || '');
}

function hasPlaylist(entry, playlistTitle) {
  return Boolean(entry?.playlist_id) || entry?.playlist_title === playlistTitle;
}

function cadenceOk(entry, cadence) {
  const expectedDays = Array.isArray(cadence?.days) && cadence.days.length ? cadence.days : ['Tuesday', 'Friday'];
  const days = entry?.publish_days || [];
  const expectedTime = cadence?.time || '10:00';
  return expectedDays.every(day => days.includes(day)) && entry?.publish_time === expectedTime;
}

function thumbnailRecord(entry) {
  return {
    filename: entry.filename,
    title: entry.title,
    target_ctr: entry.thumbnail_test?.target_ctr || '',
    actual_ctr: entry.thumbnail_test?.actual_ctr || '',
    first_30s_retention: entry.thumbnail_test?.retention_first_30s || '',
    decision: entry.thumbnail_test?.decision || 'measure after public release'
  };
}

function addRecommendation(recommendations, rec) {
  recommendations.push({
    id: `${rec.type}:${rec.video_id || rec.filename || rec.scope || 'channel'}:${recommendations.length + 1}`,
    created_at: new Date().toISOString(),
    status: 'open',
    ...rec
  });
}

function relativeFrom(root, target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function candidateRoots() {
  const currentRoot = path.resolve(__dirname, '..');
  return [
    currentRoot,
    path.join(currentRoot, 'Corporate Shadows')
  ];
}

function isWorkspaceRoot(rootDir) {
  return exists(path.join(rootDir, 'channel_config.json')) && exists(path.join(rootDir, 'metadata', 'queue.json'));
}

function resolveWorkspaceRoot() {
  const candidates = candidateRoots().filter(isWorkspaceRoot);
  if (!candidates.length) return path.resolve(__dirname, '..');
  const canonical = candidates.find(rootDir => exists(path.join(rootDir, 'metadata', 'uploads_tracker.json')));
  return canonical || candidates[0];
}

function buildContext() {
  const workspaceRoot = resolveWorkspaceRoot();
  const metadataDir = path.join(workspaceRoot, 'metadata');
  const paths = {
    workspaceRoot,
    metadataDir,
    config: path.join(workspaceRoot, 'channel_config.json'),
    queue: path.join(metadataDir, 'queue.json'),
    uploadsTracker: path.join(metadataDir, 'uploads_tracker.json'),
    analytics: path.join(metadataDir, 'youtube_analytics_status.json'),
    channelStatus: path.join(metadataDir, 'youtube_channel_status.json'),
    productionStatus: path.join(metadataDir, 'production_status.json'),
    contentCalendar: path.join(metadataDir, 'content_calendar.json'),
    report: path.join(metadataDir, 'growth_report.json'),
    recommendations: path.join(metadataDir, 'growth_recommendations.json'),
    shortsDir: path.join(metadataDir, 'shorts'),
    qcReportsDir: path.join(metadataDir, 'qc_reports'),
    assetsDir: path.join(workspaceRoot, 'assets')
  };

  return {
    workspaceRoot,
    paths,
    config: readJson(paths.config, {}),
    queue: readJson(paths.queue, []),
    uploadsTracker: readJson(paths.uploadsTracker, { uploaded_files: {} }),
    analytics: readJson(paths.analytics, { videos: [], channel_trend: {} }),
    channelStatus: readJson(paths.channelStatus, { channel: {}, videos: [] }),
    productionStatus: readJson(paths.productionStatus, []),
    contentCalendar: readJson(paths.contentCalendar, [])
  };
}

function canonicalUploads(ctx) {
  return Object.entries(ctx.uploadsTracker.uploaded_files || {})
    .filter(([, entry]) => entry?.canonical)
    .map(([filename, entry]) => {
      const scriptId = inferScriptId(filename) || inferScriptId(entry.title);
      return {
        filename,
        scriptId,
        videoId: scriptId ? formatVideoId(scriptId) : null,
        youtubeId: entry.youtube_id || '',
        title: entry.title || '',
        publishAt: entry.publish_at || '',
        uploadedAt: entry.uploaded_at || ''
      };
    })
    .filter(entry => entry.scriptId !== null)
    .sort((a, b) => a.scriptId - b.scriptId);
}

function findQueueEntry(ctx, canonical) {
  return ctx.queue.find(entry =>
    inferScriptId(entry.filename) === canonical.scriptId ||
    entry.title === canonical.title
  ) || null;
}

function findCalendarEntry(ctx, canonical) {
  return ctx.contentCalendar.find(entry =>
    inferScriptId(entry.id || entry.video_id || entry.title) === canonical.scriptId ||
    entry.youtube_video_id === canonical.youtubeId ||
    entry.title === canonical.title
  ) || null;
}

function findProductionEntry(ctx, canonical) {
  return ctx.productionStatus.find(entry =>
    inferScriptId(entry.video_id || entry.file_path) === canonical.scriptId ||
    String(entry.file_path || '').includes(canonical.filename)
  ) || null;
}

function findChannelVideo(ctx, canonical) {
  return (ctx.channelStatus.videos || []).find(video =>
    video.youtube_id === canonical.youtubeId || video.title === canonical.title
  ) || null;
}

function findIdea(ctx, scriptId) {
  return (ctx.config.viral_ideas || []).find(idea => Number(idea.id) === Number(scriptId)) || null;
}

function findAnalyticsForVideo(ctx, canonical, queueEntry, channelVideo) {
  const candidates = ctx.analytics.videos || ctx.analytics.video_metrics || [];
  return candidates.find(item =>
    item.youtube_id === canonical.youtubeId ||
    item.video_id === canonical.youtubeId ||
    item.filename === canonical.filename ||
    item.filename === queueEntry?.filename ||
    item.title === canonical.title
  ) || (channelVideo ? {
    youtube_id: channelVideo.youtube_id,
    views: channelVideo.view_count,
    published_at: channelVideo.published_at
  } : {});
}

function readQcReport(ctx, scriptId) {
  const qcPath = path.join(ctx.paths.qcReportsDir, `video_${scriptId}_qc_report.json`);
  return readJson(qcPath, null);
}

function hasPlaceholderWarning(qcReport) {
  return Array.isArray(qcReport?.warnings) && qcReport.warnings.some(warning => /placeholder/i.test(String(warning)));
}

function analyticsRows(ctx) {
  return (ctx.analytics.videos || ctx.analytics.video_metrics || []).filter(row =>
    row.impressions !== undefined ||
    row.impressionsClickThroughRate !== undefined ||
    row.averageViewPercentage !== undefined ||
    row.first30SecondRetention !== undefined
  );
}

function publicVideos(ctx) {
  return (ctx.channelStatus.videos || []).filter(video => String(video.privacy_status || video.status || '').toLowerCase() === 'public');
}

function nextScheduledVideo(ctx) {
  const now = Date.now();
  return (ctx.channelStatus.videos || [])
    .filter(video => video.publish_at)
    .map(video => ({ ...video, publishAtMs: new Date(video.publish_at).getTime() }))
    .filter(video => Number.isFinite(video.publishAtMs) && video.publishAtMs >= now)
    .sort((a, b) => a.publishAtMs - b.publishAtMs)[0] || null;
}

function buildChecks(ctx, uploads) {
  const playlist = ctx.config.growth_system?.primary_playlist || { title: 'Dark Business Empires' };
  const cadence = ctx.config.growth_system?.publishing_cadence || { days: ['Tuesday', 'Friday'], time: '10:00' };

  return uploads.map(canonical => {
    const queueEntry = findQueueEntry(ctx, canonical);
    const calendarEntry = findCalendarEntry(ctx, canonical);
    const productionEntry = findProductionEntry(ctx, canonical);
    const channelVideo = findChannelVideo(ctx, canonical);
    const qcReport = readQcReport(ctx, canonical.scriptId);
    const placeholderVisuals = hasPlaceholderWarning(qcReport) || /placeholder/i.test(String(calendarEntry?.notes || ''));

    return {
      video_id: canonical.videoId,
      script_id: canonical.scriptId,
      filename: canonical.filename,
      title: canonical.title,
      youtube_id: canonical.youtubeId,
      privacy_status: channelVideo?.privacy_status || 'unknown',
      publish_at: channelVideo?.publish_at || canonical.publishAt || '',
      playlist_ready: hasPlaylist(queueEntry, playlist.title),
      chapters_ready: hasChapters(queueEntry),
      cadence_ready: cadenceOk(queueEntry, cadence),
      thumbnail_tracking_ready: Boolean(queueEntry?.thumbnail_test),
      calendar_registered: Boolean(calendarEntry),
      production_registered: Boolean(productionEntry),
      qc_status: qcReport?.qc_status || 'missing',
      approval_required_before_public: Boolean(qcReport?.approval_required_before_public ?? queueEntry?.human_approval),
      placeholder_visuals: placeholderVisuals
    };
  });
}

function buildMetricRecommendations(ctx, uploads, recommendations) {
  const now = new Date();

  for (const canonical of uploads) {
    const queueEntry = findQueueEntry(ctx, canonical);
    const channelVideo = findChannelVideo(ctx, canonical);
    const metrics = findAnalyticsForVideo(ctx, canonical, queueEntry, channelVideo);
    const idea = findIdea(ctx, canonical.scriptId);
    const impressions = parseNumber(metrics.impressions);
    const actualCtr = parsePercent(metrics.impressionsClickThroughRate ?? metrics.ctr ?? queueEntry?.thumbnail_test?.actual_ctr);
    const targetCtr = parsePercent(metrics.target_ctr ?? idea?.target_ctr ?? queueEntry?.thumbnail_test?.target_ctr);
    const avgViewPct = parsePercent(metrics.averageViewPercentage ?? metrics.average_view_percentage);
    const first30 = parsePercent(metrics.first30SecondRetention ?? metrics.first_30s_retention ?? queueEntry?.thumbnail_test?.retention_first_30s);
    const publishedAt = metrics.published_at || metrics.publishedAt || channelVideo?.published_at || '';
    const videoAgeDays = ageInDays(publishedAt, now);
    const videoAgeHours = ageInHours(publishedAt, now);

    if (impressions !== null && actualCtr !== null && targetCtr !== null) {
      const delta = actualCtr - targetCtr;
      if (impressions >= MIN_IMPRESSIONS_FOR_THUMBNAIL_DECISION && delta <= -CTR_UNDERPERFORM_PCT_POINTS && (videoAgeDays === null || videoAgeDays >= THUMBNAIL_REVIEW_DAYS)) {
        addRecommendation(recommendations, {
          type: 'thumbnail_replace',
          priority: 'P1',
          filename: canonical.filename,
          video_id: canonical.videoId,
          title: canonical.title,
          reason: `CTR ${actualCtr.toFixed(1)}% is ${Math.abs(delta).toFixed(1)} points below target after ${impressions} impressions.`,
          evidence: { impressions, actual_ctr: actualCtr, target_ctr: targetCtr, age_days: videoAgeDays },
          action: 'Create 2 thumbnail variants and 1 tighter title variant. Do not rewrite the topic until this test is complete.'
        });
      }
    }

    if (avgViewPct !== null && avgViewPct < RETENTION_FLOOR_PERCENT) {
      const hookFailed = first30 !== null && first30 < RETENTION_FLOOR_PERCENT;
      addRecommendation(recommendations, {
        type: hookFailed ? 'hook_rewrite' : 'retention_scene_audit',
        priority: 'P1',
        filename: canonical.filename,
        video_id: canonical.videoId,
        title: canonical.title,
        reason: `Average view percentage ${avgViewPct.toFixed(1)}% is below the ${RETENTION_FLOOR_PERCENT}% floor.`,
        evidence: { average_view_percentage: avgViewPct, first_30s_retention: first30 },
        action: hookFailed
          ? 'Rewrite the first 30 seconds and tighten the promise between title, thumbnail, and cold open.'
          : 'Audit the mid-video scene sequence and map likely retention drop-offs once detailed Analytics data is available.'
      });
    }

    if (impressions !== null && actualCtr !== null && targetCtr !== null && videoAgeHours !== null && videoAgeHours <= EARLY_TOPIC_SIGNAL_HOURS && actualCtr >= targetCtr + CTR_UNDERPERFORM_PCT_POINTS) {
      addRecommendation(recommendations, {
        type: 'topic_promote',
        priority: 'P2',
        filename: canonical.filename,
        video_id: canonical.videoId,
        title: canonical.title,
        reason: `Early CTR ${actualCtr.toFixed(1)}% is more than ${CTR_UNDERPERFORM_PCT_POINTS} points above target inside ${EARLY_TOPIC_SIGNAL_HOURS} hours.`,
        evidence: { actual_ctr: actualCtr, target_ctr: targetCtr, age_hours: videoAgeHours, related_topic: idea?.topic || canonical.title },
        action: 'Promote the nearest adjacent topic in the queue and reuse the same emotional angle.'
      });
    }
  }

  const channelTrend = ctx.analytics.channel_trend || ctx.analytics.channel || {};
  const viewsPerDayChange = parsePercent(channelTrend.views_per_day_change_pct ?? channelTrend.viewsPerDayChangePct);
  const lastPublishedAt = channelTrend.last_published_at || channelTrend.lastPublishedAt;
  const daysSincePublish = ageInDays(lastPublishedAt, now);
  const cadence = ctx.config.growth_system?.publishing_cadence || { days: ['Tuesday', 'Friday'] };

  if (viewsPerDayChange !== null && viewsPerDayChange <= CHANNEL_VIEWS_DECLINE_THRESHOLD && (daysSincePublish === null || daysSincePublish > 4)) {
    addRecommendation(recommendations, {
      type: 'cadence_gap',
      priority: 'P2',
      scope: 'channel',
      reason: `Views/day are down ${Math.abs(viewsPerDayChange).toFixed(1)}% and the last publish is ${daysSincePublish === null ? 'unknown' : daysSincePublish.toFixed(1)} days old.`,
      evidence: { views_per_day_change_pct: viewsPerDayChange, days_since_publish: daysSincePublish, cadence_days: cadence.days },
      action: 'Treat this as a cadence problem before blaming topic quality. Restore the channel publishing rhythm.'
    });
  }
}

function buildOperationalRecommendations(ctx, uploads, checks, recommendations) {
  const publicCount = publicVideos(ctx).length;
  const analyticsTrigger = Number(ctx.config.growth_system?.thumbnail_testing?.review_after_public_videos) || DEFAULT_ANALYTICS_TRIGGER_PUBLIC_VIDEOS;
  const metricsAvailable = analyticsRows(ctx).length > 0;
  const upcoming = nextScheduledVideo(ctx);

  if (!metricsAvailable) {
    const reason = publicCount < analyticsTrigger
      ? `Analytics not active yet: ${publicCount}/${analyticsTrigger} public videos are live.`
      : 'Analytics trigger is met, but no YouTube Analytics data has been synced yet.';
    const action = publicCount < analyticsTrigger && upcoming
      ? `Wait for ${upcoming.title} to publish on ${upcoming.publish_at}, then sync Analytics and start metric-driven reviews.`
      : 'Add or repair the YouTube Analytics sync so CTR, impressions, and retention data populate each morning.';
    addRecommendation(recommendations, {
      type: 'analytics_pending',
      priority: publicCount < analyticsTrigger ? 'P3' : 'P1',
      scope: 'channel',
      reason,
      evidence: {
        public_videos: publicCount,
        trigger_public_videos: analyticsTrigger,
        next_scheduled_video: upcoming ? upcoming.title : null,
        next_scheduled_publish_at: upcoming?.publish_at || null
      },
      action
    });
  }

  for (const check of checks) {
    const missing = [];
    if (!check.production_registered) missing.push('production_status.json');
    if (!check.calendar_registered) missing.push('content_calendar.json');
    if (missing.length) {
      addRecommendation(recommendations, {
        type: 'metadata_sync',
        priority: 'P1',
        video_id: check.video_id,
        filename: check.filename,
        title: check.title,
        reason: `${check.video_id} is canonical on YouTube but missing from ${missing.join(' and ')}.`,
        evidence: { missing_files: missing, youtube_id: check.youtube_id, publish_at: check.publish_at },
        action: 'Register the canonical upload in both tracker-facing metadata files before the next morning run.'
      });
    }

    const channelVideo = findChannelVideo(ctx, { youtubeId: check.youtube_id, title: check.title });
    if (channelVideo && !channelVideo.publish_at && String(channelVideo.privacy_status || '').toLowerCase() === 'private') {
      addRecommendation(recommendations, {
        type: 'schedule_registration',
        priority: 'P1',
        video_id: check.video_id,
        filename: check.filename,
        title: check.title,
        reason: `${check.video_id} is uploaded privately with no publish schedule.`,
        evidence: { youtube_id: check.youtube_id, privacy_status: channelVideo.privacy_status },
        action: 'Assign the next open slot in content planning and set the actual YouTube Studio schedule manually.'
      });
    }

    const qcReport = readQcReport(ctx, check.script_id);
    const localAssetFailure = Array.isArray(qcReport?.checks) && qcReport.checks.some(item =>
      ['final_video_exists', 'final_video_non_empty', 'captions_exist'].includes(item.name) && item.ok === false
    );
    if (qcReport?.qc_status === 'failed' && localAssetFailure && check.publish_at) {
      addRecommendation(recommendations, {
        type: 'studio_copy_verify',
        priority: 'P1',
        video_id: check.video_id,
        filename: check.filename,
        title: check.title,
        reason: `Local QC failed for ${check.video_id}, but a scheduled/private YouTube copy exists.`,
        evidence: { qc_status: qcReport.qc_status, youtube_id: check.youtube_id, publish_at: check.publish_at },
        action: 'Open the YouTube Studio copy, play it end-to-end, and confirm captions/thumbnail before trusting the scheduled asset.'
      });
    }

    if (check.placeholder_visuals && check.publish_at) {
      addRecommendation(recommendations, {
        type: 'placeholder_visuals_replace',
        priority: 'P2',
        video_id: check.video_id,
        filename: check.filename,
        title: check.title,
        reason: `${check.video_id} still has placeholder visuals flagged in assets or QC warnings.`,
        evidence: { youtube_id: check.youtube_id, publish_at: check.publish_at },
        action: 'Replace placeholder visuals before this video is allowed to publish publicly.'
      });
    }
  }

  const uploadedScriptIds = new Set(uploads.map(item => item.scriptId));
  const scriptableIdeas = (ctx.config.viral_ideas || []).filter(idea => SCRIPTABLE_STATUSES.has(idea.status));
  const remainingScriptable = scriptableIdeas.filter(idea => !uploadedScriptIds.has(Number(idea.id)));

  if (!remainingScriptable.length) {
    const nextIdeas = (ctx.config.viral_ideas || [])
      .filter(idea => idea.status === 'Idea Confirmed' && !uploadedScriptIds.has(Number(idea.id)))
      .sort((a, b) => (parsePercent(b.target_ctr) || 0) - (parsePercent(a.target_ctr) || 0))
      .slice(0, 3)
      .map(idea => ({ id: idea.id, title: idea.title, target_ctr: idea.target_ctr }));

    addRecommendation(recommendations, {
      type: 'script_pipeline_gap',
      priority: 'P1',
      scope: 'channel',
      reason: 'All currently scriptable ideas are already uploaded or scheduled, so the pipeline ends after the current slate.',
      evidence: { next_candidates: nextIdeas },
      action: 'Move the next idea into Drafting this week to avoid a post-slate production gap.'
    });
  }
}

function buildShortsSuggestions(ctx) {
  const suggestions = [];
  const shortsDir = ctx.paths.shortsDir;
  const publicVideoList = publicVideos(ctx);

  for (const video of publicVideoList) {
    const scriptId = inferScriptId(video.title) || inferScriptId(video.youtube_id);
    if (!scriptId) continue;

    const shortScript = path.join(shortsDir, `video_${scriptId}_short_script.json`);
    const shortMp4 = path.join(shortsDir, `video_${scriptId}_short.mp4`);
    if (!exists(shortMp4)) {
      suggestions.push({
        video_id: formatVideoId(scriptId),
        title: video.title,
        priority: exists(shortScript) ? 'P2' : 'P3',
        action: exists(shortScript)
          ? `Short script ready. Render the Short cut for video ${scriptId}.`
          : `Generate a Short script for video ${scriptId}.`
      });
    }
  }

  return suggestions;
}

function buildReport(ctx, uploads, checks, recommendations, shortsSuggestions) {
  const playlist = ctx.config.growth_system?.primary_playlist || { title: 'Dark Business Empires' };
  const cadence = ctx.config.growth_system?.publishing_cadence || { days: ['Tuesday', 'Friday'], time: '10:00' };
  const publicCount = publicVideos(ctx).length;
  const analyticsTrigger = Number(ctx.config.growth_system?.thumbnail_testing?.review_after_public_videos) || DEFAULT_ANALYTICS_TRIGGER_PUBLIC_VIDEOS;
  const blockers = [];

  for (const check of checks) {
    if (!check.chapters_ready) blockers.push(`${check.video_id}: missing chapters`);
    if (!check.playlist_ready) blockers.push(`${check.video_id}: missing playlist target`);
    if (!check.calendar_registered) blockers.push(`${check.video_id}: missing content calendar entry`);
    if (!check.production_registered) blockers.push(`${check.video_id}: missing production status entry`);
    if (check.qc_status === 'failed' && check.publish_at) blockers.push(`${check.video_id}: scheduled upload needs manual Studio verification`);
    if (check.placeholder_visuals && check.publish_at) blockers.push(`${check.video_id}: placeholder visuals still present`);
  }

  return {
    generated_at: new Date().toISOString(),
    channel: ctx.channelStatus.channel?.title || ctx.config.channel?.name || 'Corporate Shadows',
    workspace_root: ctx.workspaceRoot,
    source_files: {
      queue: relativeFrom(ctx.workspaceRoot, ctx.paths.queue),
      uploads_tracker: relativeFrom(ctx.workspaceRoot, ctx.paths.uploadsTracker),
      production_status: relativeFrom(ctx.workspaceRoot, ctx.paths.productionStatus),
      content_calendar: relativeFrom(ctx.workspaceRoot, ctx.paths.contentCalendar),
      channel_status: relativeFrom(ctx.workspaceRoot, ctx.paths.channelStatus),
      analytics: exists(ctx.paths.analytics) ? relativeFrom(ctx.workspaceRoot, ctx.paths.analytics) : 'pending YouTube Analytics sync'
    },
    primary_playlist: playlist,
    publishing_cadence: cadence,
    summary: {
      canonical_videos_checked: uploads.length,
      public_videos: publicCount,
      analytics_trigger_public_videos: analyticsTrigger,
      analytics_ready: analyticsRows(ctx).length > 0,
      blockers: blockers.length,
      recommendations_open: recommendations.length,
      ready_for_distribution_sprint: blockers.length === 0
    },
    checks,
    backlog: {
      scriptable_statuses: Array.from(SCRIPTABLE_STATUSES),
      tracked_ideas_total: Array.isArray(ctx.config.viral_ideas) ? ctx.config.viral_ideas.length : 0
    },
    thumbnail_tracking: ctx.queue
      .filter(entry => /^FINAL_VIDEO_\d+/.test(entry.filename || ''))
      .map(thumbnailRecord),
    blockers,
    shorts_suggestions: shortsSuggestions,
    next_actions: [
      'Keep playlist, chapters, and thumbnail tracking complete before public release.',
      'Use YouTube Studio for end screens and final visual/manual polish tasks.',
      'Start metric-driven thumbnail/title decisions only after Analytics data is syncing reliably.',
      'Advance one new script before the current scheduled slate runs out.'
    ]
  };
}

function buildRecommendationPackage(ctx, recommendations, shortsSuggestions) {
  return {
    generated_at: new Date().toISOString(),
    workspace_root: ctx.workspaceRoot,
    source_files: {
      queue: relativeFrom(ctx.workspaceRoot, ctx.paths.queue),
      uploads_tracker: relativeFrom(ctx.workspaceRoot, ctx.paths.uploadsTracker),
      production_status: relativeFrom(ctx.workspaceRoot, ctx.paths.productionStatus),
      content_calendar: relativeFrom(ctx.workspaceRoot, ctx.paths.contentCalendar),
      channel_status: relativeFrom(ctx.workspaceRoot, ctx.paths.channelStatus),
      analytics: exists(ctx.paths.analytics) ? relativeFrom(ctx.workspaceRoot, ctx.paths.analytics) : 'pending YouTube Analytics sync'
    },
    decision_rules: {
      thumbnail_replace: `>=${MIN_IMPRESSIONS_FOR_THUMBNAIL_DECISION} impressions, age >= ${THUMBNAIL_REVIEW_DAYS} days, CTR at least ${CTR_UNDERPERFORM_PCT_POINTS} points below target`,
      retention_floor: `averageViewPercentage below ${RETENTION_FLOOR_PERCENT}% triggers hook or scene audit`,
      topic_promote: `CTR at least ${CTR_UNDERPERFORM_PCT_POINTS} points above target in the first ${EARLY_TOPIC_SIGNAL_HOURS} hours`,
      cadence_gap: `channel views/day down ${Math.abs(CHANNEL_VIEWS_DECLINE_THRESHOLD)}% with a publish gap above 4 days`
    },
    summary: {
      recommendations_open: recommendations.length,
      analytics_available: analyticsRows(ctx).length > 0,
      note: recommendations.length
        ? 'Act on P1 items first; operational sync issues should be cleared before metric tuning.'
        : 'No growth actions open.'
    },
    recommendations: recommendations.sort((a, b) => String(a.priority).localeCompare(String(b.priority)) || String(a.type).localeCompare(String(b.type))),
    shorts_suggestions: shortsSuggestions
  };
}

function run() {
  const ctx = buildContext();
  const uploads = canonicalUploads(ctx);
  const checks = buildChecks(ctx, uploads);
  const recommendations = [];

  buildOperationalRecommendations(ctx, uploads, checks, recommendations);
  if (analyticsRows(ctx).length > 0) {
    buildMetricRecommendations(ctx, uploads, recommendations);
  }

  const shortsSuggestions = buildShortsSuggestions(ctx);
  const report = buildReport(ctx, uploads, checks, recommendations, shortsSuggestions);
  const recommendationPackage = buildRecommendationPackage(ctx, recommendations, shortsSuggestions);

  writeJson(ctx.paths.report, report);
  writeJson(ctx.paths.recommendations, recommendationPackage);

  console.log(`Workspace: ${ctx.workspaceRoot}`);
  console.log(`Growth report written: ${relativeFrom(ctx.workspaceRoot, ctx.paths.report)}`);
  console.log(`Growth recommendations written: ${relativeFrom(ctx.workspaceRoot, ctx.paths.recommendations)}`);
  console.log(`Canonical videos checked: ${report.summary.canonical_videos_checked}`);
  console.log(`Public videos: ${report.summary.public_videos}`);
  console.log(`Blockers: ${report.summary.blockers}`);
  console.log(`Open recommendations: ${recommendationPackage.summary.recommendations_open}`);
}

run();
