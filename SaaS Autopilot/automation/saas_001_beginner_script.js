'use strict';

const fs = require('fs');
const path = require('path');
const { analyzeScriptQuality } = require('./saas_autopilot_quality_standard');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'scripts', 'saas_autopilot', 'saas_001_data.json');

const scenes = [
  {
    title: 'What We Are Building', type: 'result_preview', source_file: 'scripts/saas_autopilot/saas_001_data.json', focus_terms: ['"video"', '"title"', '"scenes"'],
    voiceover: `Here is the whole project in one sentence. We will enter one video topic, run a Node.js command, and receive a complete production package: a structured script, narration files, screen recordings, a finished video, and a quality report. Start by looking at the output, not the code. On the left is our input topic: how to automate a YouTube script pipeline. In the center is the generated script with eight teaching scenes. On the right are the files the pipeline creates. The important idea is simple: one topic moves through four stages. Stage one writes the lesson. Stage two creates the voice. Stage three combines voice with matching screen demonstrations. Stage four checks the finished file. During this tutorial, every stage will have one command and one visible result. You do not need to understand the entire repository before starting. First, verify the topic title. Then count eight scenes. Finally, confirm the expected output list is visible.`,
    steps: [
      ['open','Input topic','Read the single video topic that starts the workflow.','How I Automated My Entire YouTube Script Pipeline','The topic is clear before any command runs.'],
      ['verify','Generated lesson','Open the script output and count its teaching scenes.','8 scenes','The script contains eight ordered sections.'],
      ['verify','Output checklist','Review the five files produced by the workflow.','script, audio, recordings, video, QA report','The viewer understands the finished package.']]
  },
  {
    title: 'Find The Topic In The Config', type: 'workspace_setup', source_file: 'saas_autopilot_channel_config.json', focus_terms: ['SAAS-001', 'title', 'hook'],
    voiceover: `Now locate the only input we need. Open saas autopilot channel config dot json. Use search and enter S A A S dash zero zero one. The matching record contains an ID, title, hook, angle, and difficulty. Think of this record as one row in a production spreadsheet. The ID gives every related file the same name. The title tells the script agent what to teach. The hook describes the result the viewer should see first. We are not editing credentials, schedules, or upload settings in this lesson. Click the title field and read it once. Next, look at the ID and notice that the output script uses the same number. This naming rule prevents one episode from borrowing another episode’s assets. Save only if you changed the topic. The result of this step is not a video yet. It is a clean, unambiguous job definition that every later command can locate.`,
    steps: [
      ['open','Topic configuration','Open the channel configuration file.','saas_autopilot_channel_config.json','The topic backlog is visible.'],
      ['select','SAAS-001 record','Search for the exact topic ID.','SAAS-001','One matching topic record is highlighted.'],
      ['verify','Title and hook','Read the title and promised outcome.','title + hook','The input job is clear and uniquely named.']]
  },
  {
    title: 'Generate The Eight-Scene Script', type: 'trigger_build', source_file: 'automation/saas_autopilot_script_agent.js', focus_terms: ['TOPIC_ID', 'analyzeScriptQuality', 'writeFileSync'],
    voiceover: `With the topic selected, generate the lesson. Open a terminal in the SaaS Autopilot folder. Enter node automation slash saas autopilot script agent dot j s, followed by topic S A A S dash zero zero one. Press Enter. The agent finds the topic record, builds the eight-scene script, checks its structure, and writes one JSON file. Watch for the saved path ending in scripts slash saas autopilot slash saas zero zero one data dot json. Open that file. Do not read every line. First confirm the video title at the top. Then collapse and expand the scenes array. There should be eight numbered scenes. Expand one demo steps array and look for three things: the exact instruction, the sample input, and the expected result. If those fields are missing, the lesson is too vague and must stop here. Our visible result is an eight-scene script that can be followed and recorded.`,
    steps: [
      ['enter','Terminal command','Run the script agent for this topic.','node automation/saas_autopilot_script_agent.js --topic SAAS-001','The agent prints the saved script path.'],
      ['open','Generated JSON','Open scripts/saas_autopilot/saas_001_data.json.','saas_001_data.json','The title and scenes array are visible.'],
      ['verify','Scene structure','Count scenes and inspect one demo step.','8 scenes + exact instruction + expected result','The script is specific enough to record.']]
  },
  {
    title: 'Create Fresh Narration', type: 'input_schema', source_file: 'automation/saas_autopilot_tts_agent.js', focus_terms: ['overwrite', 'audio', 'scene_'],
    voiceover: `Next, turn the script into narration. Use the command node automation slash saas autopilot T T S agent dot j s, topic S A A S dash zero zero one, overwrite. The overwrite word is important. It tells the agent to replace every older audio file instead of reusing a file that merely has the same name. Press Enter and watch the list. Scene one through scene eight should each finish successfully. Open the asset folder named assets slash saas autopilot assets slash saas zero zero one. Sort by name. You should see scene one audio through scene eight audio. Count them. The script has eight scenes, so the folder must have eight current narration files. Compare the modified times and confirm they belong to this run. At this point, play a few seconds of scene one. The words should match the new beginner lesson. The result is a complete, current voice track with no stale six-scene audio left behind.`,
    steps: [
      ['enter','Narration command','Run TTS with overwrite enabled.','node automation/saas_autopilot_tts_agent.js --topic SAAS-001 --overwrite','All eight narration jobs run.'],
      ['open','Audio asset folder','Open the SAAS-001 asset directory.','assets/saas_autopilot_assets/saas_001','Eight audio files are visible.'],
      ['verify','Audio count and time','Compare scene count and modified timestamps.','8 current audio files','No narration from the old version remains.']]
  },
  {
    title: 'Match Every Voice Scene With A Demonstration', type: 'mapping', source_file: 'automation/saas_autopilot_editor_agent.js', focus_terms: ['recording.mp4', '0.9', 'looping is forbidden'],
    voiceover: `Narration alone is not a tutorial. Every voice scene needs a matching screen recording. In the same asset folder, scene one audio pairs with scene one recording. Scene two audio pairs with scene two recording, and so on through scene eight. Open the editor agent and find the recording duration check. The recording must cover at least ninety percent of its narration. If it is shorter, the editor stops. It does not loop the same clip, and it does not substitute a text slide. Now inspect the asset checklist. For each number, confirm both files exist. Play scene three recording and look for the script-generation command shown in scene three narration. Play scene four recording and look for the narration command. This quick comparison catches mismatched footage before a ten-minute render. The result is eight complete audio-and-recording pairs, each showing the action that the viewer hears.`,
    steps: [
      ['map','Scene pairs','Pair each numbered audio file with the same numbered recording.','scene_N_audio + scene_N_recording','Eight complete pairs are listed.'],
      ['test','Duration check','Compare each recording duration with its narration.','recording at least 90 percent of audio','No short clip needs to be looped.'],
      ['verify','Action match','Preview scenes three and four against their narration.','visible command matches spoken command','The demonstration supports the explanation.']]
  },
  {
    title: 'Render The Final Video', type: 'action_configuration', source_file: 'automation/saas_autopilot_editor_agent.js', focus_terms: ['PRODUCTION_FPS', 'Concatenating', 'outputFile'],
    voiceover: `Now combine the eight pairs into one video. Enter node automation slash saas autopilot editor agent dot j s, topic S A A S dash zero zero one, overwrite. Press Enter. The editor processes one scene at a time. For every scene it prints the narration duration. It then joins the scenes in order, mixes quiet background music under the voice, and writes the final M P four file. Watch for the line that begins final video. Open videos slash saas autopilot slash S A A S underscore zero zero one underscore final dot M P four. Check the file details. The duration should be longer than eight minutes, the resolution should be nineteen twenty by ten eighty, and the frame rate should be twenty-four frames per second. Scrub to the beginning, middle, and end. You should see different steps, not one repeated picture. The result is a complete local review video. Nothing has been uploaded.`,
    steps: [
      ['enter','Editor command','Start a clean production render.','node automation/saas_autopilot_editor_agent.js --topic SAAS-001 --overwrite','Eight scenes begin processing.'],
      ['verify','Editor summary','Read the final path, size, and scene durations.','SAAS_001_FINAL.mp4','The editor reports a successful render.'],
      ['open','Review video','Open the final MP4 and scrub three positions.','beginning, middle, end','The video is complete and visually changes.']]
  },
  {
    title: 'Read The Quality Report', type: 'qa_debug', source_file: 'metadata/qa_reports/saas_001_qa_report.json', focus_terms: ['duration_qc', 'visual_qc', 'repetition_qc'],
    voiceover: `Before trusting the video, run the quality agent. Enter node automation slash saas autopilot Q A agent dot j s, topic S A A S dash zero zero one. The agent creates a report in metadata slash Q A reports. Open saas zero zero one Q A report dot json. Read only three sections first. Duration Q C shows the number of seconds and the minimum of four hundred eighty. Visual Q C shows how much of the video was black. Repetition Q C shows whether sampled frames were duplicated. For this review copy, duration is about six hundred thirty-three seconds, black ratio is zero, and repeated ratio is zero. Next, look at production evidence. It confirms that every scene came from a recording and gives the final video hash. If any metric fails, fix the source and render again. Do not turn a red result green by changing the threshold. The result is evidence that the file is technically complete, not merely long.`,
    steps: [
      ['enter','QA command','Run the topic quality agent.','node automation/saas_autopilot_qa_agent.js --topic SAAS-001','A JSON report is written.'],
      ['open','Three QA sections','Open duration, visual, and repetition results.','duration_qc + visual_qc + repetition_qc','The measured values are visible.'],
      ['verify','Production evidence','Confirm recording sources and the final hash.','8 recordings + video SHA-256','The report belongs to this exact render.']]
  },
  {
    title: 'Review Before Uploading', type: 'publish_handoff', source_file: 'metadata/review_approvals/saas_001_approval.json', focus_terms: ['approved', 'watched_full_video', 'action_sync_verified'],
    voiceover: `The final step belongs to a person, not an automated score. Watch the entire review video. Ask three simple questions. First, can a beginner explain what the pipeline does after the opening minute? Second, does every spoken action appear on screen at the same time? Third, can the viewer identify the input, command, and result in each scene? Open metadata slash review approvals slash saas zero zero one approval dot json. The fields approved, watched full video, action sync verified, and final output verified remain false until the review is complete. Add a reviewer name only after watching the whole file. The video hash already identifies the exact copy under review. If the lesson is confusing, leave approval false and rebuild it, which is exactly what this revision does. Only an approved pilot can unlock the remaining twenty episodes. The result is a controlled handoff: a clear review copy locally, with uploads and schedulers still disabled.`,
    steps: [
      ['open','Review checklist','Open the SAAS-001 approval record.','saas_001_approval.json','The required human checks are visible.'],
      ['verify','Full-watch questions','Check clarity, action synchronization, and final output.','understand + follow + verify','The reviewer evaluates teaching quality.'],
      ['verify','Upload remains blocked','Leave approval false until the complete review passes.','approved = false','No unclear pilot can reach the channel.']]
  }
];

const script = {
  _generated_at: new Date().toISOString(), _format: 'SAAS_AUTOPILOT_BEGINNER_PILOT_v2', _agent: path.basename(__filename), channel: 'SaaS Autopilot',
  video: { id:'SAAS-001', title:'How to Build a YouTube Automation Pipeline with Node.js, Step by Step', topic:'Beginner Node.js YouTube production pipeline', angle:'One input, one command, and one visible result per stage', hook:'Turn one topic into a checked local review video.', target_ctr:'11%', difficulty:'Beginner', status:'pilot_script_complete' },
  production: { format:'screen_recorded_step_by_step_demo', style:'beginner follow-along with input-action-result framing', voice_backend:'elevenlabs', target_duration_seconds:600, minimum_duration_seconds:480, assets_dir:'assets/saas_autopilot_assets/saas_001/' },
  scenes: scenes.map((scene,index)=>({ ...scene, scene_number:index+1, visual_type:'screen_recording', visual_note:`Show only the relevant area of ${scene.source_file}; use large labels for INPUT, ACTION, and RESULT.`, pacing_note:'One goal, one action, one verified result before moving on.', demo_steps:scene.steps.map((s,i)=>({timestamp:`${index}:${String(i*20).padStart(2,'0')}`,action_type:s[0],ui_target:s[1],exact_instruction:s[2],sample_input:s[3],expected_result:s[4],visual_anchor:`${s[1]} -> ${s[4]}`})), visual_plan:{screen_type:'beginner_real_pipeline_capture',foreground_elements:[scene.source_file,...scene.steps.map(s=>s[1])],cursor_action:scene.steps.map(s=>`${s[0]} ${s[1]}`).join('; '),zoom_target:scene.steps[0][1],on_screen_text:`${scene.title}: INPUT -> ACTION -> RESULT`,data_panels:['input','action','result']}})),
  metadata:{primary_keyword:'YouTube automation pipeline Node.js beginner',description_template:'Build a local YouTube automation pipeline with Node.js, one step at a time.\n\nDownload this video\'s PDF materials:\nhttps://drive.google.com/drive/folders/1NB4deu0_7g23VByy4txQXYjtjJONZcrD\n\n#AIAutomation #NodeJS #YouTubeAutomation #HowTo',tags:['YouTube automation','Node.js tutorial','AI workflow','beginner automation','production QA'],thumbnail_concept:'One topic entering a four-stage pipeline and a checked final video coming out.'}
};

const quality=analyzeScriptQuality(script); if(!quality.passed){console.error(quality.failures.join('\n'));process.exit(1)}
fs.writeFileSync(OUTPUT,JSON.stringify(script,null,2)); console.log(JSON.stringify(quality.metrics,null,2));
