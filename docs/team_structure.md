# Three-Team Portfolio Structure

_Last updated: 2026-05-31_

## Overview

This project runs three parallel production teams, each targeting a separate YouTube channel.

| Team | Channel | Status | First Publish |
|------|---------|--------|--------------|
| Corporate Shadows Team | Corporate Shadows | Active (maintenance) | Jun 2, 2026 |
| Saints Team | The Saints | Active (production) | Jun 23, 2026 |
| SaaS Autopilot Team | AI Operator (TBD) | Setup phase | Aug 1, 2026 |

---

## Team 1 — Corporate Shadows

**Focus:** Dark business history documentary shorts and long-form.
**Format:** Omni Flash — cinematic dark style, rapid-cut generated clips, 8–14 min.
**Config:** `channel_config.json`
**Agent:** `agents/core_agent_prompts.md`
**Scripts:** `scripts/video_N_data.js`
**Assets:** `assets/video_N_assets/`
**OAuth:** `automation/credentials/oauth_tokens.json`
**Current state:** 6 videos scheduled (Jun 2 – Jun 19). New long-form production paused pending analytics.

## Team 2 — The Saints

**Focus:** Orthodox Christian saints — respectful documentary format.
**Format:** Icon/monastery imagery, calm narration, no cinematic drama.
**Config:** `The Saints/saints_channel_config.json`
**Agent:** `agents/saint_seraphim_episode_agent_pack.md`
**Scripts:** `The Saints/scripts/saints_video_N_data.js`
**Assets:** `The Saints/assets/saints_video_N_assets/`
**OAuth:** `The Saints/automation/credentials/saints_oauth_tokens.json` ← **separate from CS**
**Current state:** 7 scripts ready (SAINTS-013 to 019). Visual sourcing in progress. First publish Jun 23.

## Team 3 — SaaS Autopilot (AI Operator)

**Focus:** Practical AI tools and B2B SaaS automation workflows.
**Format:** Screen recording + narration or animated explainer. Clean, technical, results-first.
**Config:** `SAAS_AUTOPILOT_channel_config.json`
**Agent:** `agents/SAAS_AUTOPILOT_team_agent.md`
**Scripts:** `scripts/SAAS_AUTOPILOT/`
**Assets:** `assets/SAAS_AUTOPILOT_assets/`
**OAuth:** `automation/credentials/SAAS_AUTOPILOT_oauth_token.json` ← **not yet created**
**Current state:** Setup phase. 5 topic ideas in backlog. Production starts after 3 workflow templates are tested.

---

## Shared Infrastructure

| File | Purpose |
|------|---------|
| `metadata/canonical_slate.json` | One canonical YouTube ID per slot per channel. Check before every upload. |
| `metadata/uploads_tracker.json` | Full upload history with `canonical` flag on every entry. |
| `metadata/channel_gate_status.json` | Gate conditions and team operating status. |
| `automation/uploader_agent.js` | Upload pipeline — reads canonical_slate.json and blocks duplicate slot scheduling. |
| `automation/qc_agent.js` | QC checks — duration, hook, captions, thumbnail. |

---

## Upload Routing Rules

Each team uploads **only** to its own OAuth token. Before any upload:

1. Verify the correct OAuth file is active for your channel.
2. Check `metadata/canonical_slate.json` — if a canonical entry exists for your slot, stop and update the slate first.
3. After upload, add a canonical entry to `metadata/canonical_slate.json` and set `canonical: true` on the entry in `metadata/uploads_tracker.json`.

**Never upload Saints or SaaS Autopilot content through the Corporate Shadows OAuth token.**
