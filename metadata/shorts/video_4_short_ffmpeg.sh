#!/usr/bin/env bash
# Auto-generated — VID-0004 Sugar Lobby Short
# Estimated hook duration: ~58s (147 words at ~130 wpm documentary pace)
# Adjust -t if actual voiceover runs longer or shorter

FFMPEG="ffmpeg"

"$FFMPEG" \
  -ss 0 \
  -i "videos\uploaded\FINAL_VIDEO_4_VISUAL_UPGRADE.mp4" \
  -t 58 \
  -vf "crop=608:1080:(iw-608)/2:0,scale=1080:1920:flags=lanczos" \
  -c:v libx264 -preset fast -crf 18 \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  "metadata/shorts/video_4_short.mp4"

echo "Short written to metadata/shorts/video_4_short.mp4"
