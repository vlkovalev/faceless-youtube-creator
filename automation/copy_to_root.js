const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = 'c:\\Users\\heliu\\Desktop\\WebSItes\\faceless-youtube-creator-clean';

try {
  // 1. Copy Video MP4
  const videoSrc = path.join(WORKSPACE_DIR, 'omni_videos', 'FINAL_VIDEO_6_OMNI_FLASH.mp4');
  const videoDest = path.join(WORKSPACE_DIR, 'FINAL_VIDEO_6.mp4');
  fs.copyFileSync(videoSrc, videoDest);
  console.log('[OK] Successfully copied FINAL_VIDEO_6_OMNI_FLASH.mp4 -> FINAL_VIDEO_6.mp4 in root');

  // 2. Copy SRT Captions
  const srtSrc = path.join(WORKSPACE_DIR, 'omni_videos', 'FINAL_VIDEO_6_OMNI_FLASH.srt');
  const srtDest = path.join(WORKSPACE_DIR, 'FINAL_VIDEO_6.srt');
  fs.copyFileSync(srtSrc, srtDest);
  console.log('[OK] Successfully copied FINAL_VIDEO_6_OMNI_FLASH.srt -> FINAL_VIDEO_6.srt in root');

  // 3. Copy Scene 12 Image to serve as custom high-CTR thumbnail
  const thumbSrc = path.join(WORKSPACE_DIR, 'assets', 'video_6_assets', 'scene_12_image.png');
  const thumbDest = path.join(WORKSPACE_DIR, 'youtube_thumbnail_video_6.png');
  fs.copyFileSync(thumbSrc, thumbDest);
  console.log('[OK] Successfully copied scene_12_image.png -> youtube_thumbnail_video_6.png in root');

} catch (err) {
  console.error('[ERROR] Failed to execute copy pipeline:', err.message);
}
