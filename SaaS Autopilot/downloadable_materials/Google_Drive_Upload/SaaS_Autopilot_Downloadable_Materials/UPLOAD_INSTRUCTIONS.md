# Google Drive Upload Instructions

Folder name to create in Google Drive:

`SaaS Autopilot - Downloadable Materials`

Upload this file:

`saas_autopilot_blueprint_pack_v1.zip`

Recommended sharing:

1. Right-click the ZIP in Google Drive.
2. Select `Share`.
3. Under `General access`, choose `Anyone with the link`.
4. Set role to `Viewer`.
5. Copy the share link.
6. Paste that public URL back into Codex.

After you provide the public Drive link, run:

```powershell
node automation/saas_autopilot_apply_blueprint_url_agent.js --url "PASTE_PUBLIC_DRIVE_LINK_HERE"
node automation/saas_autopilot_full_cycle_qaqc_agent.js
node automation/saas_autopilot_youtube_description_repair_agent.js
```

QA requirement:

- The link must open without requesting viewer login.
- The file must be downloadable.
- The link must resolve before descriptions are pushed to YouTube.
