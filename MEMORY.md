# Project Memory - Corporate Shadows / Channel Portfolio

## Channels
- **Corporate Shadows** (`UCLoMxa-9cfCOP_5fPkL0lPg`) - Dark business history & corporate scams. Active production.
- **The Saints** - Orthodox/Catholic saint stories. Research-only until Corporate Shadows gate is met.
- **AI/B2B SaaS** - Parked. Third channel, highest monetization ceiling. Do not start until Saints is running.

## Current Priority
Get 5 Corporate Shadows videos publicly live with publish-quality visuals. Everything else is secondary.

## Publishing Gates
- Minimum script duration: 480 seconds (hard QC block)
- Visual standard: meaningful visual change every 10-20 seconds, no long stretches of generic background
- Do not public-publish placeholder-only visuals
- Do not start Saints production until: 5+ Corporate Shadows public videos AND any single video 500+ views

## Architecture (do not rebuild)
- Data API -> operations: upload, schedule, playlist, basic stats -> metadata/youtube_channel_status.json
- Analytics API -> decisions: CTR, impressions, retention -> metadata/youtube_analytics_status.json (build when 3+ videos public)
- growth_agent.js -> typed recommendations -> metadata/growth_recommendations.json
- PM agent -> gates and schedule integrity
- Morning brief -> reads all of the above, runs daily

## Growth Agent Rules (locked)
- No thumbnail/title changes until 1,000+ impressions
- Thumbnail replace trigger: CTR more than 2pts below target for 7+ days
- Retention floor: averageViewPercentage < 40% -> hook_rewrite or retention_scene_audit
- Topic promote trigger: CTR exceeds target within first 72 hours
- Cadence gap: channel-level view decline, not video-level

## Do Not Commit
- metadata/uploads_tracker.json
- metadata/youtube_channel_status.json
- metadata/youtube_analytics_status.json (future)
- runtime metric changes to metadata/growth_recommendations.json after real Analytics data exists
- automation/credentials/
- docs/pm_dashboard.html
- Any OAuth token files

## Visual Sourcing Priority (current sprint)
1. Video 1 - De Beers (best archival assets, strongest hook)
2. Video 2 - Nestle formula
3. Video 3 - Phoebus Cartel
4. Video 4 - Sugar lobby (script expanded 2026-05-29, now ~14 min)
5. Video 5 - East India Company

Visual plans at: assets/video_N_assets/visual_plan.json
Source priority: Wikimedia Commons -> Library of Congress -> Internet Archive -> generated graphic -> Storyblocks

## Current Schedule State (2026-05-29)
- Corporate Shadows upgraded public videos: 0.
- Corporate Shadows upgraded scheduled videos: 5.
- Video 1 De Beers: FCPe5Dlk_xw, scheduled 2026-06-02 10:00 America/Denver, thumbnail/captions/playlist done.
- Video 2 Nestle formula: ZloTBQbWyf4, scheduled 2026-06-05 10:00 America/Denver, thumbnail/captions/playlist done.
- Video 3 Phoebus Cartel: mM0axfPaZBU, scheduled 2026-06-09 10:00 America/Denver, thumbnail/captions/playlist done.
- Video 4 Sugar lobby: -Tt_ijOCCRI, scheduled 2026-06-12 10:00 America/Denver, thumbnail/captions/playlist done.
- Video 5 East India Company: ZM0fbdddYZA, scheduled 2026-06-16 10:00 America/Denver, thumbnail/captions/playlist done.
- Saints gate: closed; 0 public upgraded Corporate Shadows videos, 5 scheduled. Clock starts 2026-06-02; earliest review if cadence holds is 2026-06-17. Saints remains research-only.

- 2026-05-29: Video 4 sugar lobby visual upgrade scheduled as -Tt_ijOCCRI for 2026-06-12 10:00 America/Denver; thumbnail/captions/playlist complete.

- 2026-05-29: Video 5 East India Company visual upgrade scheduled as ZM0fbdddYZA for 2026-06-16 10:00 America/Denver; thumbnail/captions/playlist complete. Wikimedia archival overlay deferred due 429.
