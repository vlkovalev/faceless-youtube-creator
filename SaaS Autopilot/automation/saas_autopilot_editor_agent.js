/**
 * SaaS Autopilot Editor Agent
 * =====================
 * Compiles scene audio files + screen recording assets into a final video.
 * Format: screen recordings overlaid with narration audio + light background music.
 *
 * Usage:
 *   node automation/saas_autopilot_editor_agent.js --topic SAAS-001
 *   node automation/saas_autopilot_editor_agent.js --topic SAAS-001 --dry-run
 *
 * Requires:
 *   - scripts/saas_autopilot/saas_001_data.json (completed script)
 *   - assets/saas_autopilot_assets/saas_001/scene_N_audio.mp3 (from saas_autopilot_tts_agent.js)
 *   - assets/saas_autopilot_assets/saas_001/scene_N_recording.mp4 (screen recording per scene)
 *     OR assets/saas_autopilot_assets/saas_001/scene_N_image.png (fallback static image)
 *
 * Output:
 *   videos/saas_autopilot/SAAS_001_FINAL.mp4
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const WORKSPACE_DIR = path.join(__dirname, '..');
const SCRIPTS_DIR   = path.join(WORKSPACE_DIR, 'scripts', 'saas_autopilot');
const ASSETS_DIR    = path.join(WORKSPACE_DIR, 'assets', 'saas_autopilot_assets');
const OUTPUT_DIR    = path.join(WORKSPACE_DIR, 'videos', 'saas_autopilot');
const BGM_PATH      = path.join(WORKSPACE_DIR, 'assets', 'bg_music.mp3');
const EDIT_REPORTS_DIR = path.join(WORKSPACE_DIR, 'metadata', 'edit_reports');
const MIN_VIDEO_DURATION_SECONDS = Number(process.env.SAAS_AUTOPILOT_MIN_VIDEO_SECONDS || 480);
const FONT_FILE = 'C\\:/Windows/Fonts/arial.ttf';
const FORCE_DEMO_SLIDES = process.env.SAAS_AUTOPILOT_FORCE_DEMO_SLIDES === '1';
const DEMO_SLIDE_FPS = Number(process.env.SAAS_AUTOPILOT_DEMO_SLIDE_FPS || 1);
const PRODUCTION_FPS = Number(process.env.SAAS_AUTOPILOT_PRODUCTION_FPS || 24);

// ── ffmpeg resolution ─────────────────────────────────────────────────────────
const LOCAL_FFMPEG = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');

function findFfmpeg() {
  if (fs.existsSync(LOCAL_FFMPEG)) return LOCAL_FFMPEG;
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  try { return execSync('where ffmpeg', { encoding: 'utf8' }).split(/\r?\n/)[0].trim(); }
  catch { throw new Error('ffmpeg not found. Install it or set FFMPEG_PATH env var.'); }
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const TOPIC_ID = (args.topic || args.t || '').toUpperCase();
const DRY_RUN  = args['dry-run'] || false;
const OVERWRITE = args.overwrite || false;
const DRAFT_PREVIEW = args['draft-preview'] || false;

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitizeId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function getAudioDuration(ffmpegBin, audioPath) {
  const ffprobeBin = ffmpegBin.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
  const out = execFileSync(ffprobeBin, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', audioPath
  ], { encoding: 'utf8' });
  return parseFloat(out.trim());
}

function getMediaDuration(ffmpegBin, mediaPath) {
  return getAudioDuration(ffmpegBin, mediaPath);
}

function buildSceneSegment(ffmpegBin, scene, assetsDir, tempDir) {
  const sceneNum   = scene.scene_number;
  const audioFile  = path.join(assetsDir, `scene_${sceneNum}_audio.mp3`);
  const videoFile  = path.join(assetsDir, `scene_${sceneNum}_recording.mp4`);
  const imageFile  = path.join(assetsDir, `scene_${sceneNum}_image.png`);
  const outSegment = path.join(tempDir, `segment_${String(sceneNum).padStart(2, '0')}.mp4`);

  if (!fs.existsSync(audioFile)) {
    console.warn(`⚠️  Scene ${sceneNum}: missing audio ${path.basename(audioFile)} — skipping scene.`);
    return null;
  }

  const duration = getAudioDuration(ffmpegBin, audioFile);

  if (fs.existsSync(videoFile)) {
    const recordingDuration = getMediaDuration(ffmpegBin, videoFile);
    if (recordingDuration < duration * 0.9) {
      throw new Error(`Scene ${sceneNum} recording is too short; looping is forbidden.`);
    }
    execFileSync(ffmpegBin, [
      '-i', videoFile,
      '-i', audioFile,
      '-t', String(duration),
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '128k',
      '-map', '0:v:0', '-map', '1:a:0',
      '-shortest',
      outSegment, '-y'
    ]);
  } else if (false && fs.existsSync(imageFile)) {
    // Static image with high-quality Ken Burns zoom-in animation
    execFileSync(ffmpegBin, [
      '-loop', '1', '-i', imageFile,
      '-i', audioFile,
      '-t', String(duration),
      '-vf', 'scale=2880:1620,zoompan=z=\'min(zoom+0.0005,1.15)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=1:s=1920x1080,fps=24',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      outSegment, '-y'
    ]);
  } else {
    throw new Error(`Scene ${sceneNum} is missing a production screen recording.`);
    /* istanbul ignore next */
    console.warn(`⚠️  Scene ${sceneNum}: no recording or image found — using black screen fallback.`);
    execFileSync(ffmpegBin, [
      '-f', 'lavfi', '-i', `color=c=#0d1117:size=1920x1080:rate=24`,
      '-i', audioFile,
      '-t', String(duration),
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      outSegment, '-y'
    ]);
  }

  console.log(`  ✅ Scene ${sceneNum} "${scene.title}" — ${duration.toFixed(1)}s`);
  return outSegment;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function resolveExistingDir(candidates) {
  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

function drawtextEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '')
    .replace(/"/g, '')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : text.slice(0, maxLength - 3) + '...';
}

function inferWorkflowName(topicTitle) {
  return shorten(String(topicTitle || 'SaaS Automation Workflow')
    .replace(/^I Built an? /i, '')
    .replace(/^How to Build an? /i, '')
    .replace(/^How to /i, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .trim(), 52);
}

function inferToolStack(topicTitle) {
  const title = String(topicTitle || '').toLowerCase();
  const tools = [];
  if (/n8n/.test(title)) tools.push('n8n');
  if (/make|zapier/.test(title)) tools.push('Make.com');
  if (/slack/.test(title)) tools.push('Slack');
  if (/telegram/.test(title)) tools.push('Telegram');
  if (/intercom/.test(title)) tools.push('Intercom');
  if (/salesforce|crm/.test(title)) tools.push('CRM');
  if (/hubspot/.test(title)) tools.push('HubSpot');
  if (/google|sheet/.test(title)) tools.push('Google Sheets');
  if (/airtable/.test(title)) tools.push('Airtable');
  if (/vapi|voice/.test(title)) tools.push('Vapi');
  if (/calendar|cal\.com|appointment/.test(title)) tools.push('Cal.com');
  if (/claude|ai|llm/.test(title)) tools.push('Claude API');
  if (/node|script|pipeline/.test(title)) tools.push('Node.js');
  if (!tools.length) tools.push('Webhook', 'AI step', 'Database');
  return [...new Set(tools)].slice(0, 4).join(' + ');
}

function buildDemoSlideSpec(scene, topicTitle) {
  if (Array.isArray(scene.demo_steps) && scene.demo_steps.length) {
    return {
      title: shorten(scene.title || `Scene ${scene.scene_number}`, 44),
      focus: shorten(scene.visual_note || scene.demo_steps[0].ui_target || topicTitle, 80),
      lines: scene.demo_steps.slice(0, 5).map(step => {
        const action = String(step.action_type || 'do').toUpperCase();
        const target = step.ui_target || 'screen';
        const result = step.expected_result || 'expected result appears';
        return `${action}: ${target} -> ${result}`;
      })
    };
  }

  const workflowName = inferWorkflowName(topicTitle);
  const stack = inferToolStack(topicTitle);
  const sceneNum = Number(scene.scene_number || 1);
  const specs = {
    1: {
      title: 'Create The Workflow',
      focus: workflowName,
      lines: [
        'Click: New workflow / New project',
        `Enter: "${workflowName}"`,
        `Connect: ${stack}`,
        'Test: Save and run empty workflow',
        'Result: Workflow shell is ready'
      ]
    },
    2: {
      title: 'Add The Trigger',
      focus: 'Capture the incoming event',
      lines: [
        'Click: Add trigger node',
        'Enter: webhook path and event name',
        'Connect: lead, ticket, email, or app event',
        'Test: Send one sample request',
        'Result: Raw input appears in the run log'
      ]
    },
    3: {
      title: 'Map The Data Fields',
      focus: 'Turn messy input into clean variables',
      lines: [
        'Click: Add transform / set fields step',
        'Enter: name, company, intent, priority',
        'Connect: mapped fields to the next action',
        'Test: Preview every mapped value',
        'Result: Clean JSON is ready for the AI step'
      ]
    },
    4: {
      title: 'Connect The AI Action',
      focus: 'Generate the useful output',
      lines: [
        'Click: Add AI / HTTP request step',
        'Enter: system prompt, user prompt, JSON schema',
        'Connect: mapped variables into the prompt',
        'Test: Run with one realistic sample',
        'Result: AI returns structured, usable output'
      ]
    },
    5: {
      title: 'Route The Result',
      focus: 'Send the answer where the team works',
      lines: [
        'Click: Add action node',
        'Enter: message, record, task, or draft fields',
        'Connect: CRM, Slack, email, sheet, or database',
        'Test: Run the workflow end to end',
        'Result: The destination updates automatically'
      ]
    },
    6: {
      title: 'QA And Publish',
      focus: 'Lock the automation before release',
      lines: [
        'Click: Execution history and error logs',
        'Enter: three test cases and fallback rules',
        'Connect: alerting for failed runs',
        'Test: happy path, edge case, bad input',
        'Result: Automation is ready to use'
      ]
    }
  };
  return specs[sceneNum] || specs[6];
}

function demoSlideFilter(scene, topicTitle) {
  const spec = buildDemoSlideSpec(scene, topicTitle);
  const sceneLabel = drawtextEscape(`STEP ${String(scene.scene_number).padStart(2, '0')} / 06`);
  const topic = drawtextEscape(shorten(topicTitle, 74));
  const title = drawtextEscape(spec.title);
  const focus = drawtextEscape(shorten(spec.focus, 80));
  const footer = drawtextEscape('Strict demo slide: what to click, enter, connect, test, and verify');
  const lines = spec.lines.map(line => drawtextEscape(shorten(line, 82)));
  const rowFilters = lines.map((line, index) => {
    const y = 408 + index * 92;
    return [
      `drawbox=x=170:y=${y - 18}:w=1580:h=70:color=0x0f172a@0.82:t=fill`,
      `drawtext=fontfile='${FONT_FILE}':text='${line}':x=205:y=${y}:fontsize=36:fontcolor=0xf8fafc`
    ].join(',');
  });
  return [
    'drawbox=x=0:y=0:w=1920:h=1080:color=0x0b1120@1:t=fill',
    'drawbox=x=0:y=0:w=1920:h=130:color=0x0284c7@0.92:t=fill',
    `drawtext=fontfile='${FONT_FILE}':text='${sceneLabel}':x=80:y=44:fontsize=38:fontcolor=0xffffff`,
    `drawtext=fontfile='${FONT_FILE}':text='${topic}':x=410:y=48:fontsize=30:fontcolor=0xe0f2fe`,
    `drawtext=fontfile='${FONT_FILE}':text='${title}':x=150:y=188:fontsize=70:fontcolor=0xffffff`,
    `drawtext=fontfile='${FONT_FILE}':text='${focus}':x=155:y=288:fontsize=40:fontcolor=0x93c5fd`,
    'drawbox=x=150:y=372:w=1620:h=530:color=0x172554@0.50:t=fill',
    ...rowFilters,
    'drawbox=x=150:y=940:w=1620:h=70:color=0x16a34a@0.86:t=fill',
    `drawtext=fontfile='${FONT_FILE}':text='${footer}':x=185:y=958:fontsize=32:fontcolor=0xf0fdf4`
  ].join(',');
}

function buildSceneSegmentV2(ffmpegBin, scene, assetsDir, tempDir, targetSceneDuration, topicTitle) {
  const sceneNum = scene.scene_number;
  const audioFile = path.join(assetsDir, `scene_${sceneNum}_audio.mp3`);
  const videoFile = path.join(assetsDir, `scene_${sceneNum}_recording.mp4`);
  const outSegment = path.join(tempDir, `segment_${String(sceneNum).padStart(2, '0')}.mp4`);

  if (!fs.existsSync(audioFile)) {
    console.warn(`Scene ${sceneNum}: missing audio ${path.basename(audioFile)} - skipping scene.`);
    return null;
  }

  const audioDuration = getAudioDuration(ffmpegBin, audioFile);
  const duration = audioDuration;
  const padDur = '0';
  const commonAudioArgs = ['-af', `apad=pad_dur=${padDur}`, '-ar', '44100', '-ac', '1', '-c:a', 'aac', '-b:a', '128k'];

  if (DRAFT_PREVIEW && FORCE_DEMO_SLIDES) {
    execFileSync(ffmpegBin, [
      '-f', 'lavfi', '-i', `color=c=#0b1120:size=1920x1080:rate=${DEMO_SLIDE_FPS}`,
      '-i', audioFile,
      '-t', String(duration),
      '-vf', demoSlideFilter(scene, topicTitle),
      ...commonAudioArgs,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      outSegment, '-y'
    ]);
  } else if (fs.existsSync(videoFile)) {
    const recordingDuration = getMediaDuration(ffmpegBin, videoFile);
    const minimumRecordingDuration = Math.max(1, audioDuration * 0.9);
    if (recordingDuration < minimumRecordingDuration) {
      throw new Error(`Scene ${sceneNum} recording is ${recordingDuration.toFixed(1)}s but narration is ${audioDuration.toFixed(1)}s. Record the full demonstration; looping is forbidden.`);
    }
    execFileSync(ffmpegBin, [
      '-i', videoFile,
      '-i', audioFile,
      '-t', String(duration),
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#111827',
      ...commonAudioArgs,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      '-map', '0:v:0', '-map', '1:a:0',
      outSegment, '-y'
    ]);
  } else if (DRAFT_PREVIEW) {
    console.warn(`Scene ${sceneNum}: no recording found - using draft-only text slide.`);
    execFileSync(ffmpegBin, [
      '-f', 'lavfi', '-i', `color=c=#1e3a8a:size=1920x1080:rate=${DEMO_SLIDE_FPS}`,
      '-i', audioFile,
      '-t', String(duration),
      '-vf', demoSlideFilter(scene, topicTitle),
      ...commonAudioArgs,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      outSegment, '-y'
    ]);
  } else {
    throw new Error(`Scene ${sceneNum} is missing ${path.basename(videoFile)}. Production videos require a real screen recording for every scene.`);
  }

  console.log(`  Scene ${sceneNum} "${scene.title}" - ${duration.toFixed(1)}s (${audioDuration.toFixed(1)}s narration)`);
  return outSegment;
}

async function main() {
  if (!TOPIC_ID) {
    console.error('❌ Error: --topic is required.');
    process.exit(1);
  }

  const scriptId   = sanitizeId(TOPIC_ID);
  const scriptPath = path.join(SCRIPTS_DIR, `${scriptId}_data.json`);
  const assetsDir  = resolveExistingDir([
    path.join(ASSETS_DIR, scriptId),
    path.join(ASSETS_DIR, TOPIC_ID),
    path.join(ASSETS_DIR, TOPIC_ID.replace(/-/g, '_'))
  ]);
  const outputFile = path.join(OUTPUT_DIR, `${TOPIC_ID.replace('-', '_')}_FINAL.mp4`);
  const tempDir    = path.join(OUTPUT_DIR, `temp_${scriptId}`);

  if (!fs.existsSync(scriptPath)) {
    console.error(`❌ Script not found: ${scriptPath}`);
    process.exit(1);
  }

  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  const ffmpegBin = DRY_RUN ? 'ffmpeg' : findFfmpeg();

  console.log(`\n🎬 SaaS Autopilot Editor Agent`);
  console.log(`   Topic: ${script.video.id} — ${script.video.title}`);
  console.log(`   Output: videos/saas_autopilot/${path.basename(outputFile)}`);
  if (DRY_RUN) console.log(`   Mode: DRY RUN\n`);
  if (DRAFT_PREVIEW) console.log('   Mode: DRAFT PREVIEW - output is not publishable');

  if (fs.existsSync(outputFile) && !OVERWRITE && !DRY_RUN) {
    console.log(`⏭️  Final video already exists. Use --overwrite to rebuild.`);
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would process scenes:');
    for (const scene of script.scenes) {
      const audioFile = path.join(assetsDir, `scene_${scene.scene_number}_audio.mp3`);
      const hasAudio  = fs.existsSync(audioFile);
      const hasVideo  = fs.existsSync(path.join(assetsDir, `scene_${scene.scene_number}_recording.mp4`));
      const hasImage  = fs.existsSync(path.join(assetsDir, `scene_${scene.scene_number}_image.png`));
      console.log(`  Scene ${scene.scene_number}: audio=${hasAudio ? '✅' : '❌'} video=${hasVideo ? '✅' : '—'} image=${hasImage ? '✅' : '—'}`);
    }
    return;
  }

  [OUTPUT_DIR, tempDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

  // Build each scene segment
  console.log('\n📦 Building scene segments...');
  const segments = [];
  const targetSceneDuration = MIN_VIDEO_DURATION_SECONDS / Math.max(script.scenes.length, 1);
  for (const scene of script.scenes) {
    const seg = buildSceneSegmentV2(ffmpegBin, scene, assetsDir, tempDir, targetSceneDuration, script.video.title);
    if (seg) segments.push(seg);
  }

  if (segments.length === 0) {
    console.error('❌ No segments produced. Check that audio files exist in assets/saas_autopilot_assets/.');
    process.exit(1);
  }

  // Add a 1-second delay to ensure the OS has released all file locks on the compiled segment files (Windows safeguard)
  console.log('\n😴 Waiting 1 second for disk buffers to flush...');
  const sleepEnd = Date.now() + 1000;
  while (Date.now() < sleepEnd) {}

  // Write concat list
  const concatList = path.join(tempDir, 'concat.txt');
  fs.writeFileSync(concatList, segments.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'));

  // Concatenate segments
  console.log('\n🔗 Concatenating segments...');
  const concatOutput = path.join(tempDir, 'concatenated.mp4');
  execFileSync(ffmpegBin, [
    '-f', 'concat', '-safe', '0', '-i', concatList,
    '-r', String(DRAFT_PREVIEW ? DEMO_SLIDE_FPS : PRODUCTION_FPS),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
    '-c:a', 'aac', '-b:a', '128k',
    concatOutput, '-y'
  ]);

  // Mix in background music if available
  if (fs.existsSync(BGM_PATH)) {
    console.log('🎵 Mixing in background music...');
    execFileSync(ffmpegBin, [
      '-i', concatOutput,
      '-stream_loop', '-1', '-i', BGM_PATH,
      '-filter_complex', '[0:a]volume=1.0[voice];[1:a]volume=0.06[bgm];[voice][bgm]amix=inputs=2:duration=first[out]',
      '-map', '0:v', '-map', '[out]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outputFile, '-y'
    ]);
  } else {
    execFileSync(ffmpegBin, [
      '-i', concatOutput,
      '-c:v', 'copy', '-c:a', 'copy',
      '-movflags', '+faststart',
      outputFile, '-y'
    ]);
  }

  // Cleanup temp
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

  const stats = fs.statSync(outputFile);
  fs.mkdirSync(EDIT_REPORTS_DIR, { recursive: true });
  const editReport = {
    topic_id: TOPIC_ID,
    created_at: new Date().toISOString(),
    video_path: outputFile,
    mode: DRAFT_PREVIEW ? 'draft_preview' : 'production',
    publishable: !DRAFT_PREVIEW,
    scenes: script.scenes.map(scene => ({
      scene_number: scene.scene_number,
      audio_file: path.join(assetsDir, `scene_${scene.scene_number}_audio.mp3`),
      recording_file: path.join(assetsDir, `scene_${scene.scene_number}_recording.mp4`),
      source_type: fs.existsSync(path.join(assetsDir, `scene_${scene.scene_number}_recording.mp4`)) ? 'screen_recording' : 'draft_placeholder'
    }))
  };
  fs.writeFileSync(path.join(EDIT_REPORTS_DIR, `${scriptId}_edit_report.json`), JSON.stringify(editReport, null, 2));
  console.log(`\n✅ Final video: ${outputFile}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
  console.log(`\n📋 Next steps:`);
  console.log(`   1. Review the video`);
  console.log(`   2. Run QC: node automation/qc_agent.js --channel SAAS_AUTOPILOT --topic ${TOPIC_ID}`);
  console.log(`   3. Upload: node automation/saas_autopilot_publisher_agent.js --topic ${TOPIC_ID}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
