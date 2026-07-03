# Project Memory - Corporate Shadows / Channel Portfolio

## Channels
- **Corporate Shadows** (`UCLoMxa-9cfCOP_5fPkL0lPg`) - Dark business history & corporate scams. Maintenance-only unless Vlad explicitly reopens production.
- **The Saints** (`UCdXKrXsLAL_EhU-lPHDg3bw`) - Orthodox/Catholic saint stories. Active production priority.
- **SaaS Autopilot SaaS** - Parked. Third channel, highest monetization ceiling. Do not start until Saints is running.

## Current Priority
Active two-team parallel production: Build both **The Saints** and **Corporate Shadows** channels. Corporate Shadows production has been officially resumed per explicit user instruction on June 2, 2026.

## Project Permission Rules (locked 2026-06-02)
- **Allow normal production actions automatically**: Scriptwriting, rendering, QC checks, private uploads, thumbnail attachments, status synchronizations, and PM dashboards/reports are fully authorized to run automatically.
- **Ask the user ONLY for delete/destructive cleanup actions**: Prompts or confirmations are required only for deleting uploaded videos, clearing databases, or irreversible file removals.

## Real-Image Workflow Rule (locked 2026-05-31)
- Finish the first 5 Corporate Shadows videos before expanding the workflow or adding Omni Flash/AI-video-heavy production.
- Created/generated visuals are acceptable when they are cleaner than low-quality archival images; prefer quality and visual clarity over forcing poor real sources.
- Real archival visuals remain useful only when they are clear, relevant, and publish-quality.
- Keep generated/created visual holds short: target 8 seconds, hard cap 10 seconds whenever practical.
- Corporate Shadows replacement schedule uses midnight Alberta time where applicable.
- The Saints release policy: If videos are ready and pass final ready gates (QC, captions, metadata, and thumbnail), upload and publish them publicly immediately. Do not delay releases.
- SaaS Autopilot release policy: No schedule. Publish publicly immediately as soon as cleared by QA/QC.
- Do not replace a scheduled YouTube upload until the new real-image replacement render passes QC.
- Safe replacement order: render replacement -> QC -> upload new private/scheduled version -> verify thumbnail/captions/playlist/end screens -> update calendar -> delete old scheduled upload.

## Publishing Gates
- Minimum script duration: 480 seconds (hard QC block)
- Visual standard: meaningful visual change every 8-10 seconds, no long stretches of generic/generated background
- Do not public-publish placeholder-only visuals
- Saints publishing gates: final QC, captions, metadata, thumbnail permission/asset, and respectful source/rights check before public release.

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

## Voice Engine Risk
- Current voice: **Piper TTS** (offline, free). Quality is robotic — assessed as highest retention risk.
- ElevenLabs backend added: `automation/elevenlabs_tts.js`. Activate with `ELEVENLABS_API_KEY` env var + `"voice_backend": "elevenlabs"` in `channel_config.json`.
- Recommended upgrade: ElevenLabs Starter ($5/mo, ~3–4 videos/mo) or Creator ($22/mo, 5+ videos/mo).
- Until upgraded, Piper is the default fallback. Do not switch mid-production on a video already half-rendered.

## Shorts Pipeline
- `automation/shorts_extractor.js` added (2026-05-30). Cuts hook scenes (1–2 by default) into 50–60s 9:16 Short script + ffmpeg command.
- Output: `metadata/shorts/video_N_short_script.json` + `metadata/shorts/video_N_short_ffmpeg.sh`
- Rule: cut and upload a Short for each video within 48h of long-form going public.
- `growth_agent.js` now surfaces Shorts suggestions in the morning brief automatically.
- Shorts are reach / discovery engine — not a watch-hours path.

## Script QC Checks (active)
- `qc_agent.js` now runs two additional script-level checks:
  - `named_individual_in_hook` — a named person must appear in scenes 1–3
  - `scene_depth_min_words` — every scene must have ≥80 words of narration

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
- Video 1 De Beers: dense created-image replacement upload OZlUgyKROv4, scheduled 2026-06-02 00:00 America/Edmonton. Thumbnail/captions/playlist done by agents; manual end screen needed on replacement. Older uploads FCPe5Dlk_xw and 6iydrpqSseU were deleted after user approval.
- Video 2 Nestle formula: ZloTBQbWyf4, scheduled 2026-06-05 00:00 America/Edmonton, thumbnail/captions/playlist/end screen done.
- Video 3 Phoebus Cartel: mM0axfPaZBU, scheduled 2026-06-09 00:00 America/Edmonton, thumbnail/captions/playlist/end screen done.
- Video 4 Sugar lobby: -Tt_ijOCCRI, scheduled 2026-06-12 00:00 America/Edmonton, thumbnail/captions/playlist/end screen done.
- Video 5 East India Company: ZM0fbdddYZA, scheduled 2026-06-16 00:00 America/Edmonton, thumbnail/captions/playlist/end screen done.
- Saints gate: open. If a video is ready (passes final QC, captions, metadata, and thumbnail checks), upload and publish it publicly on the Saints channel immediately.

- 2026-05-29: Video 4 sugar lobby visual upgrade scheduled as -Tt_ijOCCRI for 2026-06-12 10:00 America/Denver; thumbnail/captions/playlist complete.

- 2026-05-29: Video 5 East India Company visual upgrade scheduled as ZM0fbdddYZA for 2026-06-16 10:00 America/Denver; thumbnail/captions/playlist complete. Wikimedia archival overlay deferred due 429.
