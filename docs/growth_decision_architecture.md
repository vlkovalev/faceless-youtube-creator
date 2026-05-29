# Growth Decision Architecture

## Purpose

Corporate Shadows uses separate systems for operations and strategy:

- YouTube Data API handles operational actions: upload, schedule, metadata, privacy status, playlists, and basic public stats.
- YouTube Analytics API handles strategic decisions: impressions, CTR, average view duration, average view percentage, watch time, traffic sources, and retention diagnostics.
- `growth_agent.js` turns those inputs into typed recommendations.
- The PM/morning brief reads the recommendation file and reports priorities without duplicating the decision logic.

## Output Contract

`automation/growth_agent.js` writes:

- `metadata/growth_report.json`: readiness checks for playlist, chapters, cadence, thumbnail tracking, and publish gates.
- `metadata/growth_recommendations.json`: typed decisions for what to change next.

Recommendation types:

- `thumbnail_replace`
- `title_ab_test`
- `hook_rewrite`
- `retention_scene_audit`
- `topic_promote`
- `cadence_gap`

## Decision Rules

### Thumbnail / Title Replacement

Do not iterate on a thumbnail before the video has at least 1,000 impressions. Below that, CTR variance is usually noise.

Trigger a `thumbnail_replace` recommendation when all are true:

- impressions >= 1,000
- video age >= 7 days
- actual CTR is more than 2 percentage points below target CTR

Action: create 2 thumbnail variants and 1 tighter title variant. Do not change topic or rewrite the video yet.

### Retention Floor

Trigger a retention recommendation when:

- `averageViewPercentage < 40%`

If first-30-second retention is also below 40%, classify it as `hook_rewrite`.

If first-30-second retention is acceptable but average view percentage is below 40%, classify it as `retention_scene_audit`.

Future upgrade: pull minute-by-minute or segment retention from YouTube Analytics and map drop-offs back to scene/chapter timestamps.

### Topic Signal

Trigger `topic_promote` when a public video substantially beats its CTR target early:

- within first 72 hours
- actual CTR is at least 2 percentage points above target CTR

Action: move the closest related topic up the production queue and reuse the emotional angle.

### Cadence Signal

If channel-level views per day decline while there is a publishing gap, classify it as a cadence issue before blaming video quality.

Trigger `cadence_gap` when:

- channel views/day change <= -20%
- last publish is more than 4 days ago or unknown

Action: restore Tuesday/Friday cadence unless blocked by legal, factual, serious brand-risk, or final-approval issues.

## Required Analytics Fields

When YouTube Analytics API sync is added, populate `metadata/youtube_analytics_status.json` with:

```json
{
  "videos": [
    {
      "youtube_id": "...",
      "filename": "FINAL_VIDEO_1.mp4",
      "published_at": "2026-...",
      "impressions": 1000,
      "impressionsClickThroughRate": 8.4,
      "averageViewDuration": 240,
      "averageViewPercentage": 45.0,
      "first30SecondRetention": 62.0,
      "views": 500,
      "estimatedMinutesWatched": 2000
    }
  ],
  "channel_trend": {
    "views_per_day_change_pct": -22.5,
    "last_published_at": "2026-..."
  }
}
```

The Analytics API will require the OAuth scope:

`https://www.googleapis.com/auth/yt-analytics.readonly`