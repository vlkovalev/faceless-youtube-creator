# SaaS Autopilot Blueprint Pack

This pack contains viewer-downloadable materials for the SaaS Autopilot channel.

Included:

- `outreach_templates.md`: cold email, LinkedIn DM, follow-up, and objection-handling templates.
- `make_blueprint_lead_capture_email_sequence.json`: Make.com-style blueprint for capturing leads and drafting personalized outreach.
- `make_blueprint_competitor_price_monitor.json`: Make.com-style blueprint for monitoring competitor pricing and creating an action alert.
- `variables.env.example`: placeholder variables viewers must replace before use.
- `setup_checklist.md`: step-by-step setup and QA checklist.
- `resource_manifest.json`: metadata for QA/QC tracking.

Important:

- Replace all placeholder API keys, URLs, sheet IDs, webhook URLs, and sender names before using.
- These blueprint JSON files are implementation templates. Viewers may need to adjust module IDs and connection IDs after importing into Make.com.
- Never publish real API keys, private lead lists, customer data, or internal webhook URLs.

Recommended viewer flow:

1. Download the ZIP.
2. Read `setup_checklist.md`.
3. Copy `variables.env.example` and fill in your own values.
4. Import or recreate the Make.com blueprint.
5. Send a test lead through the workflow.
6. Confirm email drafts, sheet rows, and alerts are correct before running live.
