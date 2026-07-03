# SaaS Autopilot Production Failure Analysis - 2026-06-15

## What Happened

The emergency corrected uploads from 2026-06-13 met the visible 8-minute duration target, but they reused stale script JSON content that still had the old six-scene explainer format and weak narration.

Example: `scripts/saas_autopilot/saas_020_data.json` still contains:

- 6 scenes instead of the required 8+ scene strict demo format.
- 141 narration words instead of 900+.
- 0 `demo_steps`.
- 0 `visual_plan` blocks.
- old `production.minimum_duration_seconds: 180`.
- generic low-value phrases such as "streamlines your operations", "results are incredible", "Ken Burns", and mascot-style filler.

## Root Cause

The production error was in the emergency rebuild path:

- `automation/saas_autopilot_rebuild_all_min_duration_agent.js` rebuilt videos from existing stale script files.
- It did not regenerate scripts through `automation/saas_autopilot_script_agent.js`.
- It did not regenerate narration through the stricter TTS/content path.
- The editor was previously allowed to pad short narration to reach the 8-minute duration.
- QA at that time checked final duration and nonblank visuals, but did not yet check instructional content density, demo steps, visual anchors, or bad phrases.

## Why QA Passed

QA passed because the old gate answered the wrong question:

- "Is the file long enough?"
- "Is the video mostly nonblank?"
- "Do links resolve?"

It did not answer the important instructional question:

- "Does this video actually teach a strict, step-by-step automation build?"

That gap allowed long but low-quality static/demo-slide videos to pass.

## Corrective Actions Applied

- `automation/saas_autopilot_qa_agent.js` now enforces the global 480-second minimum even if stale scripts claim a lower minimum.
- `automation/saas_autopilot_qa_agent.js` now fails scripts with too few words, scenes, demo steps, visual anchors, or actionable build verbs.
- `automation/saas_autopilot_editor_agent.js` no longer pads short narration with silence.
- `automation/saas_autopilot_rebuild_all_min_duration_agent.js` now regenerates script, TTS, edit, and QA in sequence.
- `automation/saas_autopilot_publisher_agent.js` now deletes superseded duplicates after revised upload and fails if duplicate cleanup cannot complete.

## Current Status

The old stale scripts now fail QA correctly. Example SAAS-020 fails with:

- 6 scenes.
- 141 words.
- 0 demo steps.
- 0 `visual_plan` blocks.
- generic bad phrases.

The correct next production action is a strict full rebuild, then upload, then duplicate cleanup.
