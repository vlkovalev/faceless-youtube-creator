# SaaS Autopilot Library Rebuild Inventory

## Scope

- Existing scripts: 21 (`SAAS-001` through `SAAS-021`)
- Existing final videos: 21
- Existing real scene recordings: 0
- Old asset pattern: six audio/image scenes for most episodes; generated/static assets rather than complete UI demonstrations

## Decision

Every old episode requires a true rebuild. Re-editing, extending, or re-encoding the existing videos cannot satisfy the new standard because there is no real demonstration footage to preserve.

## Pilot

- Topic: `SAAS-001`
- Reason: the Node.js pipeline can be demonstrated locally without fabricating a third-party SaaS interface.
- Current script: regenerated to eight scenes and 1,420 narration words.
- Current narration: all eight audio scenes regenerated with overwrite; no old six-scene audio retained.
- Remaining pilot requirement: replace generic fallback instructions with exact actions from the real local Node pipeline, capture full-length screen recordings, render, run full-video QA, and complete human approval.

## Batch Rule

Do not rebuild or upload the remaining 20 episodes until `SAAS-001` passes the pilot release gate. Each later episode must have either a real connected application demonstration or a locally executable workflow that produces the promised result. Missing application access is a production blocker, not permission to substitute slides.
