# Agent Registry

This registry defines reusable production agents for the channel portfolio. Agents should be modular: each agent has a clear job, inputs, outputs, quality rules, and stop conditions.

## Operating Principle (Locked 2026-06-02)

1. **Allow normal production actions automatically**: Execute scriptwriting, rendering, QC checks, private uploads, thumbnail attachments, status synchronizations, and PM dashboards/reports without user prompt.
2. **Ask the user ONLY for delete or destructive cleanup actions** (e.g., deleting uploaded videos, clearing databases, or irreversible file removals).

## Channel Lanes

### Corporate Shadows
Tone: dark business history, corporate scandals, cinematic investigation, morally sharp but fact-based.
Primary output: 8+ minute monetization-ready documentaries plus Shorts.
Risk profile: defamation, unsupported claims, copyrighted assets, demonetization from sensitive topics.

### The Saints
Tone: reverent, cinematic, historically careful, spiritually serious.
Primary output: full-story saint and monastic documentaries with no upper runtime cap.
Risk profile: denominational sensitivity, copyrighted modern hagiographies, overclaiming miracles, disrespectful visuals.

### Future SaaS Autopilot Channel
Tone: practical, clear, systems-oriented, proof-based.
Primary output: tutorials, workflows, tool comparisons, templates.
Risk profile: tool churn, affiliate bias, low-quality AI hype.

## Core Agents

1. Research Agent
2. Story Architect Agent
3. Scriptwriting Agent
4. Fact and Sensitivity QC Agent
5. Production Planning Agent
6. Visual Prompt Agent
7. Voiceover Prep Agent
8. Metadata and Packaging Agent
9. Upload Safety Agent
10. Analytics Feedback Agent
11. Miracle Accounts Agent
12. Visual Formula Agent (Corporate Shadows)
13. Autopilot Orchestrator Agent
14. B-Roll Sourcing Agent (Corporate Shadows)

## Agent Selection Rules
- Use channel-specific overlays before writing scripts.
- Research must happen before scriptwriting for history, saints, finance, health, legal, or current topics.
- Fact/Sensitivity QC must run before final script approval.
- Upload Safety Agent must run before any upload or schedule action.
- Autopilot Orchestrator Agent may call existing agents, but it must not bypass QC, upload safety, replacement verification, or deletion rules.
- For saints channel, modern copyrighted source text may be summarized but not copied.
- For Corporate Shadows, every serious allegation must be sourced or framed as allegation/reporting/history.

## File Outputs
Recommended per episode:
- research_brief.md
- episode_outline.md
- script_v1.md
- script_final.md
- scene_table.md or .csv
- visual_prompts.md
- voiceover_prep.md
- metadata.md
- qc_report.md
- upload_log.md
- analytics_report.md
