# Full-Cycle QA/QC Agent for SaaS Autopilot

## System Overview

The QA/QC agent protects the full content lifecycle for the SaaS automation channel: topic, script, demo, recording, edit, metadata, downloadable resources, publishing, distribution, post-publish checks, and archive.

Default setup assumptions:

- Channel: SaaS Autopilot.
- Primary platform: YouTube long-form, with Shorts and social repurposing.
- Local source of truth: `scripts/saas_autopilot/*_data.json`, `videos/saas_autopilot`, and `metadata/qa_reports`.
- Downloadable links currently live in the YouTube description template.
- Critical issues block upload.
- The runnable local gates are implemented by `automation/saas_autopilot_qa_agent.js` and `automation/saas_autopilot_full_cycle_qaqc_agent.js`.

The agent checks local files, required metadata fields, final video presence, tags, description URLs, downloadable links, and report generation. Future connectors can add YouTube Studio, Telegram, LinkedIn, X, newsletter, landing page, and task tracker checks.

## Production Lifecycle Map

| Stage | Main Assets | QA/QC Checks | Pass Criteria | Fail Conditions | Owner | Output |
|---|---|---|---|---|---|---|
| Idea intake | Topic backlog | Audience, promise, SaaS use case, CTA fit | Clear audience/outcome | Vague idea, no business value | Producer | Approved topic |
| Brief | Brief doc | Outcome, demo scope, resource plan | Reproducible plan | Missing demo/resource | Producer | Production brief |
| Research | Notes, sources | Tool accuracy, pricing, UI status | Current and sourced | Unsupported claims | Researcher | Research pack |
| Script | Script JSON | Hook, structure, claims, CTA, resource mention | Complete script | Missing CTA, bad claim | Writer | Approved script |
| Demo workflow build | n8n/Make/Zapier/code | Works end to end | Successful test run | Broken workflow | Automation owner | Demo-ready workflow |
| SaaS automation testing | Test logs | Triggers/actions/errors/privacy | Reproducible output | Exposed keys, failed import | Automation owner | Test proof |
| Recording | Raw video/audio | Audio, screen clarity, private data | Clean raw recording | Private data visible | Creator | Raw footage |
| Editing | Final MP4 | Cuts, captions, pacing, CTA, no leaks | Final file exists and matches script | Missing/incorrect final video | Editor | Final MP4 |
| Thumbnail | PNG/JPG | Readability, brand fit, topic accuracy | Clear at small size | Wrong promise/topic | Designer | Thumbnail |
| Title | Metadata | CTR, accuracy, no false claim | Strong and truthful | Misleading title | Producer | Final title |
| Description | Metadata | Structure, chapters, CTA, links | Complete and valid | Broken/missing link | Producer | Final description |
| Downloadable resource | PDF/JSON/ZIP/etc. | Correct version, no secrets, imports/opens | Works for viewer | Wrong or private file | Resource owner | Downloadable asset |
| Downloadable link setup | Public URL/UTM | Opens, permissions, mobile, redirects | HTTP 2xx/3xx and accessible | 404, login wall, wrong file | Resource owner | Valid public link |
| Landing/resource page | Page/form/email | Page loads, form works, delivery works | Lead capture path works | Form/email broken | Growth owner | Resource page |
| YouTube upload draft | Draft video | Metadata, visibility, playlist, schedule | Draft complete | Wrong account/schedule | Publisher | Upload draft |
| Final pre-publish QA | All assets | All critical gates passed | No critical/high blockers | Any critical issue open | QA owner | Publish approval |
| Publishing | YouTube live/scheduled | Public playback, metadata live | Video reachable | Processing/playback issue | Publisher | Published video |
| Distribution | Social/email posts | Links, formatting, tracking | Posts live and tracked | Broken distribution link | Growth owner | Distribution proof |
| Post-publish QA | Live pages/posts | Public video, links, comments, analytics | All live checks pass | Viewer-facing issue | QA owner | Post-publish report |
| Archive | Final folder | Assets, reports, links, proof | Complete audit trail | Missing final records | Ops owner | Archive record |

## Mandatory QA Gates

1. Idea and Brief QA: audience relevance, clear promise, SaaS use case, business outcome, topic fit, lead magnet fit, CTA alignment.
2. Script QA: hook, structure, accuracy, supported claims, correct SaaS/tool names, explainable steps, CTA, natural resource mention.
3. Automation Demo QA: end-to-end workflow, hidden credentials, matching screens, error handling, final output, template matches demo.
4. Recording QA: audio, screen visibility, cursor/zoom clarity, no private data, pacing, file naming.
5. Editing QA: clean cuts, relevant visuals, accurate captions, no dead air, no private data, correct CTA/resource mention.
6. Packaging QA: title, thumbnail, description, chapters, tags, pinned comment, CTA, UTM/download links, disclosures.
7. Link and Downloadable QA: link opens, permissions, mobile access, file downloads/imports, version matches video, no private data, tracking works.
8. Pre-Publish QA: all previous gates passed, final video correct, metadata complete, links verified, schedule correct.
9. Post-Publish QA: public video plays, live links work, pinned comment/cards/end screens visible, distribution posts live, analytics tracking fires.

## Severity Framework

| Severity | Meaning | Examples | Publish Allowed? | SLA | Escalation |
|---|---|---|---|---|---|
| Critical | Viewer-facing or trust-breaking blocker | Broken downloadable link, private data visible, wrong workflow, missing file permission | No | Immediate | QA owner + channel owner |
| High | Serious quality/conversion issue | Bad audio, wrong thumbnail, incorrect CTA, missing disclosure | Usually no | Same day | Owner + backup |
| Medium | Should fix before publish if feasible | Outdated UI, weak chapter labels, missing tag set | Conditional | 24-48h | Owner |
| Low | Polish issue | Typo, small formatting issue | Yes | Next revision | Owner |
| Info | Improvement idea | Better CTA phrasing, alternate thumbnail idea | Yes | Backlog | Producer |

## Downloadable Link QA Metadata

| Field | Description | Example |
|---|---|---|
| Resource name | Human-readable asset name | n8n Voice Agent Blueprint |
| Resource type | PDF, ZIP, n8n JSON, prompt pack | n8n workflow JSON |
| Version | Version tied to video | v1.0 |
| Related video ID | Internal topic/video ID | SAAS-003 |
| Storage URL | Private source location | Google Drive source URL |
| Public download URL | Viewer-facing URL | https://example.com/saas-003 |
| Landing page URL | Lead capture page | https://example.com/voice-agent |
| Permission status | Public, gated, private | Public |
| UTM source | Tracking source | youtube |
| UTM medium | Tracking medium | description |
| UTM campaign | Campaign name | saas-003 |
| Owner | Responsible person | Resource owner |
| QA status | Pending/pass/fail | pass |
| Last checked date | Most recent validation | 2026-06-06 |
| Expiry/review date | Required review date | 2026-09-06 |

## Automation Accuracy QA

| Automation Element | QA Check | Pass Criteria | Common Failure | Fix Owner |
|---|---|---|---|---|
| Trigger | Event fires correctly | Test event starts workflow | Wrong webhook/event | Automation owner |
| Action config | Each action uses correct fields | Successful dry run | Missing variable | Automation owner |
| Credentials | Secrets hidden and not exported | No API keys in video/files | Exposed token | Automation owner |
| Error path | Failure behavior explained | Retry/fallback documented | Silent failure | Automation owner |
| Rate limits/pricing | Limits stated accurately | Viewer knows plan requirements | Misrepresented free plan | Researcher |
| Exported template | Imports successfully | Fresh import works | Broken JSON/blueprint | Resource owner |
| Viewer reproducibility | Steps match final output | Viewer can rebuild | Missing prerequisite | Writer |

## Publishing Checklist

- Final video file exists and is correct.
- Title is accurate and compelling.
- Description is complete.
- Thumbnail is correct.
- Playlist/category/language are set.
- Chapters/tags/captions are present where needed.
- End screen/cards/pinned comment are ready.
- Download links and UTM links pass.
- Affiliate/sponsor disclosures are present if applicable.
- Visibility and schedule are correct.
- Comments, monetization, Shorts/remix, and copyright checks are reviewed.

## Action Assignment

| Issue Category | Default Owner | Backup Owner | Severity Default | SLA | Closure Criteria |
|---|---|---|---|---|---|
| Script | Writer | Producer | Medium | 24h | QA recheck passes |
| Demo workflow | Automation owner | Producer | Critical | Immediate | Successful test proof |
| Recording | Creator | Editor | High | Same day | Clean replacement file |
| Editing | Editor | Producer | High | Same day | Final MP4 approved |
| Thumbnail | Designer | Producer | Medium | 24h | Thumbnail approved |
| Metadata | Producer | Publisher | High | Same day | Metadata QA passes |
| Downloadable asset | Resource owner | Automation owner | Critical | Immediate | File opens/imports |
| Link | Growth owner | Publisher | Critical | Immediate | Public URL passes |
| Landing page | Growth owner | Publisher | High | Same day | Page/form/email pass |
| Distribution | Growth owner | Producer | Medium | 24h | Post proof attached |
| Compliance | Producer | Channel owner | High | Same day | Disclosure/privacy fixed |
| Analytics | Growth owner | Ops owner | Medium | 48h | Tracking proof attached |
| Archive | Ops owner | Producer | Low | 72h | Archive record complete |

## Task Status Model

| Status | Meaning | Who Can Move It | Required Evidence | Next Step |
|---|---|---|---|---|
| Open | Issue detected | QA agent/QA owner | Failed check | Assign |
| Assigned | Owner selected | QA owner | Owner + SLA | Work starts |
| In progress | Fix underway | Owner | Work note | Submit fix |
| Fixed | Owner says fixed | Owner | Link/file/screenshot | Needs recheck |
| Needs recheck | Ready for QA | Owner/QA | Fix evidence | QA reruns |
| Reopened | Fix failed | QA owner | Failed recheck | Owner fixes |
| Approved | QA passed | QA owner | Passing report | Next stage |
| Waived | Accepted risk | Channel owner | Reason/expiry | Continue |
| Blocked | Cannot fix yet | Owner/QA | Blocker reason | Escalate |
| Closed | Done and archived | QA owner | Final proof | Archive |

## Report Templates

```text
Stage QA Report
Content Item:
Stage:
Date:
QA Status:
Checked By:

Passed Checks:

Failed Checks:

Issues Created:

Critical Blockers:

Required Fixes:

Owner Assignments:

Next Step:
```

```text
Downloadable Link QA Report
Resource:
Related Video:
Public URL:
Storage URL:
Checked Date:
HTTP Status:
Redirect Chain:
Permission Status:
Mobile Access:
File Opens:
File Downloads/Imports:
Version Match:
Private Data Check:
Branding/CTA Check:
Analytics/UTM Check:
Final Status:
Fix Owner:
Recheck Date:
```

```text
Final QA/QC Report
Content Item:
Video URL:
Publish Date:
QA Owner:
Final Status:

Critical Issues:
High Issues:
Medium Issues:
Low Issues:

Live Link Checks:
Distribution Checks:
Archive Location:
Audit Notes:
```
