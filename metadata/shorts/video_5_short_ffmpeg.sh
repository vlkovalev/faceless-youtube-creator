#!/usr/bin/env bash
# Auto-generated — VID-0005 East India Company Short
# Estimated hook duration: ~60s (135 words at ~130 wpm documentary pace)
# Adjust -t if actual voiceover runs longer or shorter

FFMPEG="ffmpeg"

"$FFMPEG" \
  -ss 0 \
  -i "videos\uploaded\FINAL_VIDEO_5_VISUAL_UPGRADE.mp4" \
  -t 60 \
  -vf "crop=608:1080:(iw-608)/2:0,scale=1080:1920:flags=lanczos" \
  -c:v libx264 -preset fast -crf 18 \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  "metadata/shorts/video_5_short.mp4"

echo "Short written to metadata/shorts/video_5_short.mp4"
