const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCRIPT_ID = process.argv[2] || 1;
const dataPath = path.join(__dirname, '..', 'scripts', `video_${SCRIPT_ID}_data.js`);
let scriptData = fs.readFileSync(dataPath, 'utf-8');

const match = scriptData.match(new RegExp(`window\\.SCRIPTS\\[${SCRIPT_ID}\\]\\s*=\\s*(\\{[\\s\\S]+\\});`));
if (!match) {
    console.error("Could not parse the script data.");
    process.exit(1);
}
const script = JSON.parse(match[1]);
const ASSETS_DIR = path.join(__dirname, '..', 'assets', `video_${SCRIPT_ID}_assets`);

if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

console.log("Starting Piper TTS Voice Generation...");

const piperExe = path.join(__dirname, 'piper_tts', 'piper', 'piper.exe');
const modelPath = path.join(__dirname, 'piper_tts', 'piper', 'voice.onnx');

script.scenes.forEach((scene, index) => {
    const sceneNumber = index + 1;
    console.log(`Generating Audio for Scene ${sceneNumber}...`);
    
    const textToSpeak = scene.voiceover.replace(/<[^>]*>?/gm, '');
    const outputPath = path.join(ASSETS_DIR, `scene_${sceneNumber}_audio.wav`);
    
    const tempTextPath = path.join(ASSETS_DIR, `temp_${sceneNumber}.txt`);
    fs.writeFileSync(tempTextPath, textToSpeak);
    
    try {
        // Run Piper TTS
        execSync(`Get-Content "${tempTextPath}" | & "${piperExe}" --model "${modelPath}" --output_file "${outputPath}"`, { shell: 'powershell.exe' });
    } catch (e) {
        console.error("Piper failed for scene " + sceneNumber, e.message);
    }
    
    if(fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath);
});

console.log("\nAll voiceovers generated successfully in .wav format!");
