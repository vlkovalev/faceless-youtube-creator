#!/usr/bin/env bash
# Renders all 5 Corporate Shadows Shorts in sequence.
# Run from the project root: bash metadata/shorts/render_all_shorts.sh
# Each short is cropped to 9:16 (1080x1920) from the first N seconds of the long-form video.
# Adjust -t values per video if voiceover runs longer than estimated.

set -e
echo "================================================="
echo "  Corporate Shadows — Shorts Render Pipeline"
echo "================================================="

FFMPEG="ffmpeg"
SHORTS_DIR="metadata/shorts"

render_short() {
  local VIDEO_NUM=$1
  local INPUT=$2
  local DURATION=$3
  local OUTPUT="${SHORTS_DIR}/video_${VIDEO_NUM}_short.mp4"

  if [ -f "$OUTPUT" ]; then
    echo "⏭️  Video ${VIDEO_NUM} short already exists — skipping. Delete to re-render."
    return
  fi

  echo ""
  echo "🎬 Rendering Short ${VIDEO_NUM} (${DURATION}s)..."
  "$FFMPEG" -ss 0 -i "$INPUT" -t "$DURATION" \
    -vf "crop=608:1080:(iw-608)/2:0,scale=1080:1920:flags=lanczos" \
    -c:v libx264 -preset fast -crf 18 \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    "$OUTPUT"
  echo "✅ Short ${VIDEO_NUM} written to ${OUTPUT}"
}

render_short 1 "videos/uploaded/FINAL_VIDEO_1_VISUAL_UPGRADE.mp4" 58
render_short 2 "videos/uploaded/FINAL_VIDEO_2_VISUAL_UPGRADE.mp4" 57
render_short 3 "videos/uploaded/FINAL_VIDEO_3_VISUAL_UPGRADE.mp4" 55
render_short 4 "videos/uploaded/FINAL_VIDEO_4_VISUAL_UPGRADE.mp4" 58
render_short 5 "videos/uploaded/FINAL_VIDEO_5_VISUAL_UPGRADE.mp4" 60

echo ""
echo "================================================="
echo "  All shorts rendered."
echo "  Upload schedule:"
echo "    video_1_short.mp4 — within 48h of Jun 1"
echo "    video_2_short.mp4 — within 48h of Jun 4"
echo "    video_3_short.mp4 — within 48h of Jun 8"
echo "    video_4_short.mp4 — within 48h of Jun 11"
echo "    video_5_short.mp4 — within 48h of Jun 15"
echo ""
echo "  Before uploading each Short:"
echo "    1. Open video_N_short_script.json for title, description, tags"
echo "    2. Replace [paste YouTube link] with the long-form URL"
echo "    3. Upload via YouTube Studio → Shorts"
echo "    4. Pin a comment with the full video link"
echo "================================================="
