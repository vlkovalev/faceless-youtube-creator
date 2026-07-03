# Agent Usage Guide

## How To Use This Library

For each episode, run the agent prompts in this order:

1. Select channel overlay
   - Corporate Shadows
   - The Saints
   - SaaS Autopilot

2. Research Agent
   Output: research_brief.md

3. Story Architect Agent
   Output: episode_outline.md

4. Scriptwriting Agent
   Output: script_v1.md and script_final.md

5. Fact and Sensitivity QC Agent
   Output: qc_report.md and required fixes

6. Visual Formula Agent (Corporate Shadows only)
   Validates script against the canonical 10-minute visual formula.
   Reference: docs/visual_formula_template.json and agents/visual_formula_agent.md
   Output: visual_formula_compliance_report.md
   Must pass before proceeding to production planning.

7. Production Planning Agent
   Output: scene_table.md or scene_table.csv
   For Corporate Shadows, run `Corporate Shadows/automation/visual_asset_planner.js --video N` instead of writing the scene table by hand — it reads the script and the canonical visual formula and outputs `assets/video_N_assets/visual_plan.json` with per-beat asset types, search queries, and act-specific b-roll/sound/camera guidance.

8. B-Roll Sourcing Agent (Corporate Shadows only)
   Replaces zoompan-on-still placeholder visuals with real stock footage automatically.
   Reference: agents/broll_sourcing_agent.md
   Run: `node Corporate Shadows/automation/broll_sourcing_agent.js --video N` (requires a free PEXELS_API_KEY and/or PIXABAY_API_KEY in automation/credentials/.env).
   Without an API key, run `broll_shortlist_generator.js` instead for a manual-click checklist.
   Run before the `edit` pipeline stage so the final render uses real footage, not zoomed stills.

9. Visual Prompt Agent
   Output: visual_prompts.md

10. Voiceover Prep Agent
    Output: voiceover_prep.md

11. Metadata and Packaging Agent
    Output: metadata.md, title options, thumbnail concepts

12. Upload Safety Agent
    Output: upload_readiness_report.md

13. Analytics Feedback Agent
    Output: analytics_report.md after publishing

## Build or Find Existing Agents

Default approach:
- Build our own prompts when channel tone, safety, or workflow needs are specific.
- Reuse external tools or agent templates only when they improve a concrete step, such as transcription, asset search, analytics, or upload automation.
- Keep final prompts in this repo so the production system remains portable.

## Current Custom Agents Built

- Core Research Agent
- Core Story Architect Agent
- Core Scriptwriting Agent
- Core Fact and Sensitivity QC Agent
- Core Production Planning Agent
- Core Visual Prompt Agent
- Core Voiceover Prep Agent
- Core Metadata and Packaging Agent
- Core Upload Safety Agent
- Core Analytics Feedback Agent
- Miracle Accounts Agent
- Corporate Shadows overlay
- The Saints overlay
- SaaS Autopilot overlay
- Saint Seraphim episode pack
- Visual Formula Agent (Corporate Shadows)
- B-Roll Sourcing Agent (Corporate Shadows)

## Next Agents To Add

- Saints Thumbnail Agent
- Saints Source Rights Agent
- SaaS Autopilot Tutorial Workflow Agent
- Sponsorship/Affiliate Packaging Agent
