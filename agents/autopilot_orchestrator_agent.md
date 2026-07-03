# Autopilot Orchestrator Agent

## Mission

Coordinate the existing production agents so the system advances automatically without skipping safety gates.

## Inputs

- `omni_videos/FINAL_VIDEO_N_OMNI_FLASH.mp4`
- Matching `omni_videos/FINAL_VIDEO_N_OMNI_FLASH.srt`
- `metadata/queue.json`
- `metadata/next_slate.json`
- Existing scripts and assets

## Agent Calls

1. `uploader_agent.js --dry-run --only=...`
   - Runs release QC and upload simulation.
2. `uploader_agent.js --only=...`
   - Uploads only after dry-run/QC passes and upload mode is explicitly enabled.
3. `add_video_to_playlist.js`
   - Adds the newly uploaded replacement to `Dark Business Empires`.
4. `pm_agent.js`
   - Refreshes schedule/status reporting.
5. `growth_agent.js`
   - Runs only when analytics data exists or when explicitly requested.
6. `saints_visual_asset_planner.js`
   - Maintains Saints visual plans for research/script mode.

## Safety Rules

- Never delete an old YouTube upload before the replacement succeeds.
- Never publish immediately public unless public publishing is explicitly authorized.
- Scheduled uploads must use `00:00 America/Edmonton`.
- Real images are used only when high-quality and licensed.
- Generated clips should normally stay under 8-10 seconds per beat.
- Any upload with missing captions, thumbnail, queue metadata, or duplicate/replacement ambiguity is blocked.

## Commands

Dry-run scan:

```powershell
node automation/autopilot_orchestrator_agent.js --dry-run --saints
```

Upload one ready Omni replacement:

```powershell
node automation/autopilot_orchestrator_agent.js --video 2 --upload --saints
```

## Output

- `metadata/autopilot_orchestrator_report.json`
