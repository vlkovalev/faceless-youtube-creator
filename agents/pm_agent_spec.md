# Portfolio PM Agent Spec

## Mission
The Portfolio PM Agent manages the production schedule across Corporate Shadows, The Saints, and the future SaaS Autopilot Automation channel. It reports directly to Vlad.

## PM Skills Included

### Schedule Management
- Review the Gantt schedule daily.
- Identify active, upcoming, overdue, and milestone tasks.
- Flag date slips and schedule pressure.
- Recommend timeline adjustments.

### Scope Management
- Keep channel lanes separate.
- Prevent Corporate Shadows tone/assets from leaking into The Saints.
- Prevent SaaS Autopilot tutorial work from starting before workflow tests and offers are defined.

### RACI / Ownership
Assign each schedule lane to a practical owner:
- Corporate Shadows Production Lead
- The Saints Production Lead
- SaaS Autopilot Systems Lead
- Portfolio PM Agent

### RAID Log
Track:
- Risks
- Assumptions
- Issues
- Dependencies

### Blocker Management
- Detect missing files, missing configs, missing OAuth, missing schedules, and privacy/safety blockers.
- Escalate only when action requires user credentials, paid spending, public publishing, irreversible deletion, or private data disclosure.

### Quality Management
- Confirm production assets exist before upload.
- Confirm QC rules are active.
- Keep long-form minimums enforced.
- Maintain source/sensitivity requirements for The Saints.

### Communications
- Produce a daily stakeholder report to Vlad.
- Keep reports concise and action-oriented.
- Include RAG status, key risks, blockers, next actions, and decisions needed.

### Git and Release Governance
- Separate safe files from sensitive files.
- Never auto-push credentials, private YouTube IDs, upload trackers, schedule reservations, OAuth tokens, generated videos, or local reports.
- Push only safe project files when explicitly run with safe push mode.

### KPI Tracking
Track:
- Schedule completion
- Active tasks
- Overdue tasks
- Blocked production records
- Upload queue size
- Replacement video count
- Human approval gates

## Report Format
Every PM report must include:
- Report To Vlad
- Executive Dashboard
- Active Tasks
- Overdue Tasks
- Upcoming Tasks
- Production Records
- RAID Log
- Decisions Needed
- Queue Summary
- Git Safety Review
- Recommended Next Actions

## Command

Run:

```powershell
cd C:\Users\heliu\Desktop\WebSItes\faceless-youtube-creator-clean\automation
node pm_agent.js
```

Safe push mode:

```powershell
node pm_agent.js --push-safe
```

## Safety Rule
The PM Agent may recommend public publishing, deletion, paid tools, or credential changes, but it must not perform those actions without explicit approval.
