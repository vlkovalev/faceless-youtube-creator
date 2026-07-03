'use strict';

const fs = require('fs');
const path = require('path');
const { analyzeScriptQuality } = require('./saas_autopilot_quality_standard');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'scripts', 'saas_autopilot', 'saas_001_data.json');

const sceneSpecs = [
  {
    title: 'Run The Finished Pipeline',
    type: 'result_preview',
    file: 'automation/saas_autopilot_run_pipeline.js',
    voiceover: `Start with the finished system. This repository has one Node command that coordinates script generation, narration, editing, quality assurance, and publishing. Open automation slash saas autopilot run pipeline dot j s. The stages array is not hidden behind a diagram; the script calls the real specialist agents in order. In the terminal, enter node automation slash saas autopilot run pipeline dot j s, topic SAAS zero zero one, stage q a. For this review we keep upload disabled. Watch the channel hold and pilot gates report their state before any external action can happen. The useful result is not a claim that the workflow is autonomous. It is a reproducible run with a script file, eight narration assets, a final video path, and a machine-readable quality report. By the end, we will intentionally trigger a missing-recording failure, add the required evidence, and show how the corrected build becomes eligible for human review.`,
    steps: [
      ['open', 'Pipeline runner source', 'Open automation/saas_autopilot_run_pipeline.js and locate the stage switch.', 'stage switch', 'The script, TTS, edit, QA, and upload stages are visible.'],
      ['enter', 'Pipeline command field', 'Enter the topic and QA-stage command for SAAS-001.', 'node automation/saas_autopilot_run_pipeline.js --topic SAAS-001 --stage qa', 'The exact reproducible command appears.'],
      ['verify', 'Run summary panel', 'Verify the expected script, audio, video, and report outputs.', 'SAAS-001 outputs', 'Four concrete output paths are shown.']
    ]
  },
  {
    title: 'Select The Topic And Guard The Channel',
    type: 'workspace_setup',
    file: 'saas_autopilot_channel_config.json',
    voiceover: `Now configure the job from its source of truth. Open saas autopilot channel config dot json and search for S A A S dash zero zero one. The topic record contains the title, angle, hook, target click-through rate, and difficulty. The pipeline never invents a topic ID at render time. Next open metadata slash channel activity hold dot json. Local rebuild work is enabled, but the Windows scheduler and comments task remain disabled. Then open metadata slash pilot release gate dot json. The pilot topic is S A A S zero zero one and its state is pilot in production. That second gate prevents a batch upload from slipping through while the reference episode is still being reviewed. These controls matter because a good production system separates permission to build locally from permission to modify a live channel. Confirm the title matches the episode, confirm the pilot ID, and leave upload scheduling untouched.`,
    steps: [
      ['open', 'Topic backlog', 'Open the channel configuration and locate SAAS-001.', 'SAAS-001', 'The exact title and production angle are visible.'],
      ['open', 'Channel hold file', 'Inspect the local rebuild permission without enabling schedulers.', 'channel_activity_hold.json', 'Local production is enabled while live operations remain disabled.'],
      ['verify', 'Pilot release gate', 'Confirm SAAS-001 is the only pilot allowed through the release gate.', 'pilot_topic_id = SAAS-001', 'Batch publication remains blocked.']
    ]
  },
  {
    title: 'Generate A Structured Script',
    type: 'trigger_build',
    file: 'automation/saas_autopilot_script_agent.js',
    voiceover: `The script agent is the first production stage. Open automation slash saas autopilot script agent dot j s and find build strict user prompt. The prompt requires eight scenes, concrete demo steps, visual plans, sample inputs, and expected results. Run the agent with topic S A A S zero zero one. It writes scripts slash saas autopilot slash saas zero zero one data dot json. Open that file and expand scene one. Each scene has narration plus a demo steps array. A step is only useful when it names the action, the interface target, the exact instruction, the sample input, and the expected result. The quality analyzer then counts scenes, narration words, demo steps, visual anchors, and actionable verbs. If any minimum is missed, the script is rejected before text to speech spends time or money. Verify eight scenes are present and confirm that every scene points to a real project file or output that can be shown on screen.`,
    steps: [
      ['click', 'Strict prompt builder', 'Locate buildStrictUserPrompt in the script agent.', 'buildStrictUserPrompt', 'The required scene and demo-step schema is visible.'],
      ['enter', 'Script command field', 'Run the script agent for SAAS-001.', 'node automation/saas_autopilot_script_agent.js --topic SAAS-001', 'The script JSON path is returned.'],
      ['verify', 'Generated scenes array', 'Count the scenes and inspect the first demo_steps array.', '8 scenes', 'Every scene has exact instructions and expected results.']
    ]
  },
  {
    title: 'Validate Inputs And Remove Stale Assets',
    type: 'input_schema',
    file: 'automation/saas_autopilot_tts_agent.js',
    voiceover: `Before narration, validate the input and eliminate stale artifacts. The earlier production failure happened because a new script reused audio files from an older six-scene version. Open the T T S agent and find the overwrite flag. For a rebuild, use node automation slash saas autopilot t t s agent dot j s, topic S A A S zero zero one, overwrite. The pipeline runner now passes overwrite automatically during a complete run. Open the asset folder and confirm scene one through scene eight audio files share the current rebuild timestamp. Then compare the script scene count with the audio count. Both must equal eight. This is a simple reconciliation, but it closes a dangerous loophole: matching filenames do not prove matching content. Finally inspect the first scene title embedded in the script and compare it with the T T S console output. The title, count, and timestamp together establish that narration belongs to this exact script revision.`,
    steps: [
      ['open', 'TTS overwrite logic', 'Locate the overwrite handling in the TTS agent.', '--overwrite', 'The stale-audio bypass condition is visible.'],
      ['enter', 'TTS command field', 'Run TTS with overwrite for all eight scenes.', 'node automation/saas_autopilot_tts_agent.js --topic SAAS-001 --overwrite', 'Eight narration files are regenerated.'],
      ['verify', 'Asset reconciliation table', 'Compare script scenes, audio files, and timestamps.', '8 script scenes = 8 audio files', 'No old six-scene narration remains.']
    ]
  },
  {
    title: 'Map Scenes To Real Recordings',
    type: 'mapping',
    file: 'automation/saas_autopilot_editor_agent.js',
    voiceover: `Now map each narration scene to evidence. Open the editor agent and locate build scene segment version two. For scene N, the editor expects scene underscore N underscore audio dot m p three and scene underscore N underscore recording dot m p four. It probes both durations. A recording shorter than ninety percent of its narration fails instead of looping. Images, generated slides, and black frames are not accepted in production mode. The draft preview flag is the only place a placeholder can exist, and an edit report marks that output as not publishable. For this pilot, scene one shows the pipeline runner, scene two shows configuration and gates, scene three shows script generation, scene four shows narration reconciliation, scene five shows the asset mapping, scene six shows quality analysis, scene seven shows a deliberate failure and correction, and scene eight shows the final review package. Verify every row maps to a recording file before invoking the editor.`,
    steps: [
      ['click', 'Scene segment builder', 'Open buildSceneSegmentV2 in the editor.', 'buildSceneSegmentV2', 'Duration and source checks are visible.'],
      ['map', 'Scene asset table', 'Map each of eight scene numbers to audio and recording files.', 'scene_N_audio + scene_N_recording', 'Eight complete asset pairs are listed.'],
      ['verify', 'Recording duration gate', 'Confirm every recording covers at least ninety percent of narration.', 'recording >= 0.9 x narration', 'No loop or placeholder is required.']
    ]
  },
  {
    title: 'Run Full Video Quality Gates',
    type: 'action_configuration',
    file: 'automation/saas_autopilot_qa_agent.js',
    voiceover: `The quality agent checks more than runtime. Open automation slash saas autopilot q a agent dot j s. First, instructional analysis rejects short narration, missing demo steps, weak visual anchors, and generic filler phrases. Next, F F probe verifies the final duration is at least four hundred eighty seconds. Black detection now scans the complete video, not only the opening minute. Repetition analysis samples frames across the entire runtime and rejects excessive duplicates. The production evidence check reads the edit report and requires every scene source to be a screen recording. It also computes a S H A two fifty six hash for the rendered file. Human approval must contain the same hash, proving that the reviewer watched the exact file being published. Run the Q A command and inspect the JSON report rather than relying on a green console line. Every gate must expose its metrics and failures.`,
    steps: [
      ['open', 'QA source', 'Locate duration, black-frame, repetition, and evidence checks.', 'qa_agent.js', 'All four video gates are visible.'],
      ['enter', 'QA command field', 'Run QA for SAAS-001.', 'node automation/saas_autopilot_qa_agent.js --topic SAAS-001', 'A topic-specific JSON report is written.'],
      ['verify', 'QA report metrics', 'Inspect duration, repeated ratio, scene sources, and video hash.', 'qa_reports/saas_001_qa_report.json', 'The report exposes evidence for each decision.']
    ]
  },
  {
    title: 'Trigger A Failure And Correct It',
    type: 'qa_debug',
    file: 'metadata/production_failure_analysis_2026-06-15.md',
    voiceover: `A trustworthy tutorial shows the failure path. Remove one recording from the asset checklist, without deleting the source file, and run the editor preflight. The editor reports that the scene recording is missing and stops. Restore the checklist entry, then test a recording duration below ninety percent of narration. The second failure explains that looping is forbidden. Replace it with the complete capture and rerun preflight. Now all eight scene pairs pass. This is the exact class of defect that produced the old low-quality library: the earlier editor could loop a short clip or substitute a generated slide, while Q A mainly checked duration and nonblank frames. Open the production failure analysis and compare the old behavior with the corrected gates. The lesson is operational: a failed build is preferable to an eight-minute video that teaches nothing. Confirm the corrected preflight shows eight recordings and zero placeholders before rendering.`,
    steps: [
      ['test', 'Editor preflight', 'Run preflight with one scene recording omitted from the checklist.', 'missing scene_7_recording.mp4', 'The build stops with a precise missing-recording error.'],
      ['test', 'Duration preflight', 'Test a recording shorter than ninety percent of narration.', 'short recording', 'The build stops and reports that looping is forbidden.'],
      ['configure', 'Corrected asset set', 'Restore the complete full-length recording set.', '8 complete recordings', 'Preflight passes with zero placeholders.']
    ]
  },
  {
    title: 'Render And Prepare Human Review',
    type: 'publish_handoff',
    file: 'metadata/review_approvals/approval_template.json',
    voiceover: `With the assets complete, run the editor with topic S A A S zero zero one and overwrite. The editor concatenates the eight synchronized recordings, mixes narration with low background music, enables fast start, and writes S A A S underscore zero zero one underscore final dot m p four. Run Q A again. Automated checks can validate structure, duration, blank frames, repetition, source evidence, links, and the final hash. They cannot decide whether the tutorial is genuinely clear. Open metadata slash review approvals slash approval template dot json. The reviewer must watch the complete video, verify that visible actions match narration, confirm the final output, add a reviewer name, and paste the exact video hash. Until those fields are true, the publisher fails. The pilot release gate also blocks every other episode. This review copy is therefore ready to inspect, but not ready to upload. Only after the pilot is approved should the remaining twenty topics enter the same rebuild sequence.`,
    steps: [
      ['enter', 'Editor command field', 'Render SAAS-001 with overwrite.', 'node automation/saas_autopilot_editor_agent.js --topic SAAS-001 --overwrite', 'A new final MP4 and edit report are written.'],
      ['run', 'Final QA command', 'Run the complete QA agent against the new render.', 'node automation/saas_autopilot_qa_agent.js --topic SAAS-001', 'Automated metrics and the exact video hash are produced.'],
      ['verify', 'Human approval template', 'Review the full video and bind approval to its hash.', 'saas_001_approval.json', 'Publication remains blocked until human approval is complete.']
    ]
  }
];

const script = {
  _generated_at: new Date().toISOString(),
  _format: 'SAAS_AUTOPILOT_REAL_PIPELINE_PILOT_v1',
  _agent: path.basename(__filename),
  channel: 'SaaS Autopilot',
  video: {
    id: 'SAAS-001',
    title: 'How I Automated My Entire YouTube Script Pipeline with Claude + Node.js',
    topic: 'A real local Node.js production pipeline with strict quality gates',
    angle: 'Exact project files, commands, failure path, and review evidence',
    hook: 'Build and verify the real pipeline instead of watching an automation diagram.',
    target_ctr: '11%', difficulty: 'Medium', status: 'pilot_script_complete'
  },
  production: {
    format: 'screen_recorded_step_by_step_demo',
    style: 'actual local project files and execution evidence',
    voice_backend: 'elevenlabs', target_duration_seconds: 600,
    minimum_duration_seconds: 480,
    assets_dir: 'assets/saas_autopilot_assets/saas_001/'
  },
  scenes: sceneSpecs.map((scene, index) => ({
    scene_number: index + 1,
    title: scene.title,
    type: scene.type,
    voiceover: scene.voiceover,
    visual_type: 'screen_recording',
    visual_note: `Demonstrate ${scene.file} with cursor movement, visible commands, and actual project evidence.`,
    pacing_note: 'Show each action before stating its expected result.',
    source_file: scene.file,
    demo_steps: scene.steps.map((step, stepIndex) => ({
      timestamp: `${index}:${String(stepIndex * 20).padStart(2, '0')}`,
      action_type: step[0], ui_target: step[1], exact_instruction: step[2],
      sample_input: step[3], expected_result: step[4],
      visual_anchor: `${step[1]} and ${step[4]}`
    })),
    visual_plan: {
      screen_type: 'real_local_pipeline_capture',
      foreground_elements: [scene.file, ...scene.steps.map(step => step[1])],
      cursor_action: scene.steps.map(step => `${step[0]} ${step[1]}`).join('; '),
      zoom_target: scene.steps[0][1],
      on_screen_text: scene.title,
      data_panels: ['project file', 'command', 'verified result']
    }
  })),
  metadata: {
    primary_keyword: 'YouTube automation pipeline Node.js',
    description_template: 'Build the real SaaS Autopilot Node.js production pipeline step by step.\n\nDownload this video\'s PDF materials:\nhttps://drive.google.com/drive/folders/1NB4deu0_7g23VByy4txQXYjtjJONZcrD\n\n#AIAutomation #NodeJS #YouTubeAutomation #HowTo',
    tags: ['YouTube automation', 'Node.js automation', 'AI workflow', 'SaaS tutorial', 'production QA'],
    thumbnail_concept: 'Actual pipeline source and QA report with one clear PASS gate.'
  }
};

const quality = analyzeScriptQuality(script);
if (!quality.passed) {
  console.error(quality.failures.join('\n'));
  process.exit(1);
}
fs.writeFileSync(OUTPUT, JSON.stringify(script, null, 2));
console.log(JSON.stringify({ output: OUTPUT, quality: quality.metrics }, null, 2));
