const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const video5Assets = path.join(__dirname, '..', 'assets', 'video_5_assets');
console.log('Scanning Video 5 assets directory...');

const files = fs.readdirSync(video5Assets);
for (const file of files) {
  if (/\.(jpg|png|jpeg)$/i.test(file) && !file.includes('_resize')) {
    const filePath = path.join(video5Assets, file);
    const stats = fs.statSync(filePath);
    
    // If image is larger than 1.5MB, let's downscale it using Python/PIL to a safe 1920x1080 size
    if (stats.size > 1500000) {
      console.log(`Processing high-res image: ${file} (${(stats.size / (1024 * 1024)).toFixed(1)} MB)...`);
      
      // We will write a temp script file to run via python to avoid inline command line quoting/syntax issues
      const tempScriptPath = path.join(__dirname, 'temp_resize.py');
      const scriptContent = `
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
try:
    im = Image.open(r"${filePath.replace(/\\/g, '\\\\')}")
    im.thumbnail((1920, 1080), Image.Resampling.LANCZOS)
    if im.mode in ('RGBA', 'P'):
        im = im.convert('RGB')
    im.save(r"${filePath.replace(/\\/g, '\\\\')}", "JPEG", quality=90)
    print("Resized successfully")
except Exception as e:
    print("Error:", str(e))
`;
      fs.writeFileSync(tempScriptPath, scriptContent, 'utf8');
      try {
        const out = execSync(`python "${tempScriptPath}"`, { encoding: 'utf8' });
        console.log(`Result for ${file}: ${out.trim()}`);
        const newStats = fs.statSync(filePath);
        console.log(`Done! New size: ${(newStats.size / 1024).toFixed(1)} KB`);
      } catch (err) {
        console.error(`Failed to resize ${file}:`, err.message);
      } finally {
        if (fs.existsSync(tempScriptPath)) {
          fs.unlinkSync(tempScriptPath);
        }
      }
    }
  }
}
console.log('Downscale operation completed.');
