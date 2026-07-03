# Channel Portfolio Execution Plan

_Last updated: 2026-06-19_

## Current State (as of 2026-06-19)

Corporate Shadows has moved from the first five-video launch batch into active rebuild and publishing operations. Current per-video state lives in `metadata/production_status.json`, `metadata/content_calendar.json`, and the channel-specific `Corporate Shadows/metadata/` folder.

Operational corrections:
- Saints production and publishing gate is open. Do not wait for Corporate Shadows public-video or view thresholds.
- Corporate Shadows non-delete production, dry-run, schedule, and publish work is allowed by `metadata/approval_policy.json`; deletion/destructive cleanup still requires explicit approval.
- VID-0005 is ready locally in `Corporate Shadows/` and should be uploaded/published from the current render, not from stale/deleted YouTube ID ZM0fbdddYZA.
- VID-0008 and VID-0009 approval bottlenecks are stale; run dry-run/upload from QC-passed assets instead of waiting on old human-approval flags.

Legacy May 2026 scheduled IDs are historical only and should not block current production or publishing.

Historical launch slate:

| # | Topic | YouTube ID | Scheduled |
|---|-------|-----------|-----------|
| 1 | De Beers diamond cartel | FCPe5Dlk_xw | 2026-06-02 10:00 MT |
| 2 | Nestlé baby formula | ZloTBQbWyf4 | 2026-06-05 10:00 MT |
| 3 | Phoebus Cartel | mM0axfPaZBU | 2026-06-09 10:00 MT |
| 4 | Sugar lobby | -Tt_ijOCCRI | 2026-06-12 10:00 MT |
| 5 | East India Company | ZM0fbdddYZA | 2026-06-16 10:00 MT |

Thumbnail, captions, and playlist status should be verified from current metadata before each publish action.

---

## Priority Order

### 1. Corporate Shadows (active)
- All 5 videos scheduled. Focus shifts to monitoring first publics and preparing Shorts.
- Voice engine: Piper TTS (offline, robotic). ElevenLabs backend added in `automation/elevenlabs_tts.js`; set `voice_backend: "elevenlabs"` in `channel_config.json` + `ELEVENLABS_API_KEY` env var to activate.
- QC now blocks on: duration ≥480s, named individual in hook (scenes 1–3), scene depth ≥80 words/scene.

### 2. The Saints / Orthodox story channel
- Separate YouTube channel — do not upload through Corporate Shadows.
- Gate open by user instruction on 2026-06-08.
- Full production and publishing are allowed once QC, rights/source, metadata, captions, and thumbnail checks pass.

### 3. SaaS Autopilot SaaS channel
- Parked. Start earliest August 2026 after pilots. Highest monetization ceiling long-term.

---

## Shorts Strategy

YouTube Shorts are the primary discovery engine in 2025-2026. Each long-form video should have a companion Short cut from the hook.

**Rule:** For every video that goes public, generate and publish a companion Short within 48 hours of the long-form going live.

**Pipeline:**

1. **Pre-cut** — before publish day, run:
   ```
   node automation/shorts_extractor.js --video-id <N>
   ```
   This writes:
   - `metadata/shorts/video_N_short_script.json` — narration, duration estimate, metadata template
   - `metadata/shorts/video_N_short_ffmpeg.sh` — ffmpeg crop-to-9:16 command

2. **Review** — check estimated duration (target 50–60s). Adjust `--hook-scenes 1,2,3` if scenes 1–2 are too short.

3. **Render** — run the generated shell script:
   ```
   bash metadata/shorts/video_N_short_ffmpeg.sh
   ```
   Output: `metadata/shorts/video_N_short.mp4` — 1080×1920 vertical.

4. **Upload manually** — upload via YouTube Studio. Set title to first hook sentence + `#Shorts`. Use description from `short_script.json`.

5. **Link** — add long-form video link in the Short description. Pin a comment with the link.

**Morning brief integration:** `growth_agent.js` automatically surfaces a Shorts suggestion whenever a video goes public and no Short has been cut yet. It also pre-suggests cutting Video 1 before its publish date.

**Target cadence:** one Short per long-form video. Build a backlog of 5 Shorts matching the 5 scheduled videos.

---

## Voice Quality Roadmap

Current: Piper TTS (offline, free, robotic quality — highest retention risk).

**To upgrade to ElevenLabs:**
1. Get API key from elevenlabs.io (Starter plan ~$5/mo covers ~30,000 chars/month ≈ 3–4 full videos).
2. Set env var: `ELEVENLABS_API_KEY=sk-...`
3. In `channel_config.json`, set: `"voice_backend": "elevenlabs"`
4. Re-run `automation/elevenlabs_tts.js --video-id 1 --out-dir assets/video_1_assets` to regenerate audio.
5. Rebuild final video with `automation/editor_beat_agent.js`.

Voice ID default: `JBFqnCBsd6RMkjVDRZzb` (George — deep, authoritative). Can be overridden with `--voice-id` flag or by editing `ELEVENLABS_DEFAULT_VOICE_ID` in the file.

**Cost estimate for all 5 videos:** ~5,000 words each × 5 videos × avg 5 chars/word = ~125,000 chars. Creator plan ($22/mo) covers this comfortably.

---

## Active Workstreams

### Corporate Shadows (sprint: June 2026)
1. Monitor Video 1 CTR and retention in first 72 hours (2026-06-02 onwards).
2. Cut and upload Short for Video 1 before 2026-06-04.
3. Cut Shorts for Videos 2–5 before their respective publish dates.
4. After 1,000+ impressions on any video: review thumbnail CTR against target.
5. After 3 public videos: build YouTube Analytics API sync (`metadata/youtube_analytics_status.json`).
6. If retention < 40% on any video: run `scripts/video_N_data.js` hook audit.

### QC checks (active)
All checks run via `node automation/qc_agent.js <N>`:
- `long_form_duration_minimum` — ≥480s hard block
- `named_individual_in_hook` — named person in scenes 1–3
- `scene_depth_min_words` — every scene ≥80 words
- `captions_exist`, `thumbnail_exists`, `scene_audio_count`, `metadata_queue_entry`

### Saints Channel
- Gate open by user instruction on 2026-06-08.
- Continue verified visual upgrades, render QC-passed episodes, upload private drafts, then publish once release checks pass.
- Keep separate Saints queue, channel branding, and OAuth routing.
- Episodes 2–6 queued: Paisios, Silouan, Anthony the Great, Herman of Alaska, Sergius of Radonezh.

---

## Do Not
- Delete files, delete YouTube videos, or run destructive cleanup without explicit approval.
- Route Saints uploads through Corporate Shadows OAuth or channel assets.
- Push `automation/credentials/`, `metadata/uploads_tracker.json`, `metadata/youtube_channel_status.json`, or any OAuth token files.
- Change thumbnails or titles before 1,000 impressions.
- Start SaaS Autopilot channel before August 2026 pilot review.
