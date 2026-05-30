# Agent Usage Guide

## How To Use This Library

For each episode, run the agent prompts in this order:

1. Select channel overlay
   - Corporate Shadows
   - The Saints
   - AI / B2B Automation

2. Research Agent
   Output: research_brief.md

3. Story Architect Agent
   Output: episode_outline.md

4. Scriptwriting Agent
   Output: script_v1.md and script_final.md

5. Fact and Sensitivity QC Agent
   Output: qc_report.md and required fixes

6. Production Planning Agent
   Output: scene_table.md or scene_table.csv

7. Visual Prompt Agent
   Output: visual_prompts.md

8. Voiceover Prep Agent
   Output: voiceover_prep.md

9. Metadata and Packaging Agent
   Output: metadata.md, title options, thumbnail concepts

10. Upload Safety Agent
   Output: upload_readiness_report.md

11. Analytics Feedback Agent
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
- Corporate Shadows overlay
- The Saints overlay
- AI / B2B Automation overlay
- Saint Seraphim episode pack

## Next Agents To Add

- Saints Thumbnail Agent
- Saints Source Rights Agent
- Corporate Shadows Visual Sourcing Agent
- AI/B2B Tutorial Workflow Agent
- Sponsorship/Affiliate Packaging Agent

