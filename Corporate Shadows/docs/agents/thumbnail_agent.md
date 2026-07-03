# Corporate Shadows Thumbnail Agent

The thumbnail agent creates upload-ready thumbnails in the current Corporate Shadows assets-folder style: dark documentary background, one symbolic scandal object, and oversized red-neon headline text.

## Command

```powershell
node automation\thumbnail_agent.js --video 10 --overwrite --jpg
```

The default output is taken from the matching `metadata/queue.json` entry, usually:

```text
assets/youtube_thumbnail_video_<id>.png
assets/youtube_thumbnail_video_<id>.jpg
```

## Useful Overrides

```powershell
node automation\thumbnail_agent.js --video 10 --text "FAKE GOLD" --overwrite --jpg
node automation\thumbnail_agent.js --video 8 --concept "A green sprout breaking through a rusted lock, bold text: 'PATENTED'." --overwrite --jpg
node automation\thumbnail_agent.js --title "The Poison Gas Cover-Up" --text "EVADING JUSTICE" --output assets\youtube_thumbnail_video_12.png --overwrite --jpg
```

## Style Rules

- 1280x720, YouTube-ready.
- Dark cinematic background with heavy vignette.
- One bold symbolic object on the left.
- Big condensed headline on the right.
- Black headline fill with red neon stroke/glow.
- Also writes a `.thumbnail_report.json` beside the thumbnail for traceability.
