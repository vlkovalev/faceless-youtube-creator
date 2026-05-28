const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Manually set FFmpeg path so we don't rely on terminal restarts
ffmpeg.setFfmpegPath('C:\\Users\\heliu\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffmpeg.exe');
const ffprobePath = 'C:\\Users\\heliu\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin\\ffprobe.exe';
ffmpeg.setFfprobePath(ffprobePath);

const SCRIPT_ID = process.argv[2] || 1;
const ASSETS_DIR = path.join(__dirname, '..', 'assets', `video_${SCRIPT_ID}_assets`);
const OUTPUT_FILE = path.join(__dirname, '..', `FINAL_VIDEO_${SCRIPT_ID}.mp4`);
const BGM_PATH = path.join(__dirname, '..', 'assets', 'bg_music_dark.mp3');

// Load Script Data for Captions
const dataPath = path.join(__dirname, '..', 'scripts', `video_${SCRIPT_ID}_data.js`);
let scriptData = fs.readFileSync(dataPath, 'utf-8');
const match = scriptData.match(new RegExp(`window\\.SCRIPTS\\[${SCRIPT_ID}\\]\\s*=\\s*(\\{[\\s\\S]+\\});`));
const script = JSON.parse(match[1]);

console.log("Starting Video Editor Agent (Hollywood Pipeline)...");

const scenes = [];
for (let i = 1; i <= 12; i++) {
    const audioPath = path.join(ASSETS_DIR, `scene_${i}_audio.wav`); 
    const videoPath = path.join(ASSETS_DIR, `scene_${i}_video.mp4`);
    const imagePath = path.join(ASSETS_DIR, `scene_${i}_image.png`);
    
    // Clean Voiceover Text for Captions
    const voiceover = script.scenes[i-1].voiceover.replace(/<[^>]*>?/gm, '');
    
    if (fs.existsSync(audioPath)) {
        if (fs.existsSync(videoPath)) {
            scenes.push({ audioPath, visualPath: videoPath, type: 'video', index: i, text: voiceover });
        } else if (fs.existsSync(imagePath)) {
            scenes.push({ audioPath, visualPath: imagePath, type: 'image', index: i, text: voiceover });
        } else {
            console.error(`Missing visual for scene ${i}`);
        }
    }
}

if (scenes.length === 0) {
    console.error("No scene assets found!");
    process.exit(1);
}

function getAudioDuration(audioPath) {
    try {
        const out = execSync(`"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
        return parseFloat(out.toString().trim());
    } catch (e) {
        console.error("Failed to probe audio", e);
        return 10; // fallback
    }
}

function formatSrtTime(seconds) {
    const date = new Date(0);
    date.setSeconds(seconds);
    const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
    const timeStr = date.toISOString().substr(11, 8);
    return `${timeStr},${ms}`;
}

async function createSceneVideo(scene) {
    return new Promise((resolve, reject) => {
        const outPath = path.join(ASSETS_DIR, `scene_${scene.index}_temp.mp4`);
        const duration = getAudioDuration(scene.audioPath);
        console.log(`Rendering Scene ${scene.index} [Type: ${scene.type}, Duration: ${duration}s]...`);
        
        let cmd = ffmpeg();
        
        let filterStr = "";
        
        if (scene.type === 'video') {
            cmd = cmd.input(scene.visualPath).inputOptions(['-stream_loop', '-1']);
            cmd = cmd.input(scene.audioPath);
            filterStr = `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30`;
        } else {
            cmd = cmd.input(scene.visualPath).inputOptions(['-loop', '1', '-framerate', '30']);
            cmd = cmd.input(scene.audioPath);
            const totalFrames = Math.ceil(duration * 30);
            filterStr = `[0:v]scale=3840:-1,zoompan=z='min(zoom+0.001,1.5)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30`;
        }
        
        // Add Color Grading (Captions are embedded as a soft toggleable track at the end!)
        filterStr += `,eq=contrast=1.1:saturation=0.8[v]`;
        
        cmd = cmd.complexFilter([filterStr]);
        
        cmd.outputOptions([
            '-map [v]',
            '-map 1:a',
            '-c:v libx264',
            '-c:a aac',
            '-b:a 192k',
            '-ar 44100',
            '-ac 2',
            '-pix_fmt yuv420p',
            `-t ${duration}` // Force exact duration
        ])
        .save(outPath)
        .on('end', () => resolve(outPath))
        .on('error', (err) => reject(err));
    });
}

async function run() {
    const tempVideos = [];
    let totalDuration = 0;
    
    // Generate synchronized master SRT subtitles
    let currentSrtTime = 0;
    let srtContent = "";
    
    for (const scene of scenes) {
        try {
            const duration = getAudioDuration(scene.audioPath);
            
            // Format timestamps for SRT
            const startTimeStr = formatSrtTime(currentSrtTime);
            const endTimeStr = formatSrtTime(currentSrtTime + duration);
            
            srtContent += `${scene.index}\n`;
            srtContent += `${startTimeStr} --> ${endTimeStr}\n`;
            srtContent += `${scene.text}\n\n`;
            
            currentSrtTime += duration;
            totalDuration += duration;
            
            const vidPath = await createSceneVideo(scene);
            tempVideos.push(vidPath);
        } catch(e) {
            console.error("Error creating scene " + scene.index, e);
            return;
        }
    }

    const masterSrtPath = OUTPUT_FILE.replace('.mp4', '.srt');
    fs.writeFileSync(masterSrtPath, srtContent);
    console.log(`Generated master subtitles: ${masterSrtPath}`);

    console.log(`\nAll scenes rendered. Total duration: ${totalDuration.toFixed(2)}s. Concatenating...`);
    
    const concatListPath = path.join(ASSETS_DIR, 'concat.txt');
    const concatContent = tempVideos.map(v => `file '${v.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);
    
    const tempConcatPath = path.join(ASSETS_DIR, 'temp_concat.mp4');

    // Step 1: Concatenate all videos seamlessly
    await new Promise((resolve, reject) => {
        ffmpeg()
            .input(concatListPath)
            .inputOptions(['-f concat', '-safe 0'])
            .outputOptions(['-c copy'])
            .save(tempConcatPath)
            .on('end', resolve)
            .on('error', reject);
    });

    console.log("Adding Background Music & Embedding Soft Subtitles...");

    // Step 2: Mix BGM and Embed Subtitles
    await new Promise((resolve, reject) => {
        ffmpeg()
            .input(tempConcatPath)
            .input(BGM_PATH)
            .inputOptions(['-stream_loop', '-1']) // Loop BGM forever (applied to BGM_PATH)
            .input(masterSrtPath) // Embed soft subtitles as third input
            .complexFilter([
                `[1:a]aresample=44100,volume=0.35[bg]`, // Resample BGM and set to 35% volume (louder as requested!)
                `[0:a][bg]amix=inputs=2:duration=first[a]`
            ])
            .outputOptions([
                '-map 0:v',
                '-map [a]',
                '-map 2:s', // Map subtitle stream from input index 2
                '-c:v copy', // Copy the heavy video track (super fast)
                '-c:a aac',
                '-c:s mov_text', // Embed soft subtitles inside MP4 container
                '-b:a 192k',
                `-t ${totalDuration.toFixed(3)}` // Enforce precise total duration
            ])
            .save(OUTPUT_FILE)
            .on('end', resolve)
            .on('error', reject);
    });

    console.log(`\n==========================================`);
    console.log(`[SUCCESS] Final Hollywood video exported to:`);
    console.log(OUTPUT_FILE);
    console.log(`[SUCCESS] Master SRT subtitles exported to:`);
    console.log(masterSrtPath);
    console.log(`==========================================\n`);
    
    // Cleanup
    fs.unlinkSync(concatListPath);
    fs.unlinkSync(tempConcatPath);
    tempVideos.forEach((v) => {
        fs.unlinkSync(v);
    });
}

run();
