const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\heliu\\.gemini\\antigravity\\brain\\1e45e937-d4ae-494a-9689-fda950998950';
const destDir = 'c:\\Users\\heliu\\Desktop\\WebSItes\\faceless-youtube-creator-clean\\assets\\video_6_assets';

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const mapping = {
  'scene_1_image_1780246551586.png': 'scene_1_image.png',
  'scene_2_image_1780246573798.png': 'scene_2_image.png',
  'scene_3_image_1780246590300.png': 'scene_3_image.png',
  'scene_4_image_1780246611958.png': 'scene_4_image.png',
  'scene_5_image_1780246630353.png': 'scene_5_image.png',
  'scene_6_image_1780246656669.png': 'scene_6_image.png',
  'scene_7_image_1780246677324.png': 'scene_7_image.png',
  'scene_8_image_1780246693737.png': 'scene_8_image.png',
  'scene_9_image_1780246713292.png': 'scene_9_image.png',
  'scene_10_image_1780246734717.png': 'scene_10_image.png',
  'scene_11_image_1780246754448.png': 'scene_11_image.png',
  'scene_12_image_1780246772307.png': 'scene_12_image.png'
};

for (const [srcName, destName] of Object.entries(mapping)) {
  const srcPath = path.join(srcDir, srcName);
  const destPath = path.join(destDir, destName);
  fs.copyFileSync(srcPath, destPath);
  console.log(`Copied ${srcName} -> ${destName}`);
}

console.log('All keyframes successfully copied!');
