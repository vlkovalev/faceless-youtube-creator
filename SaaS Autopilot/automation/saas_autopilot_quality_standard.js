'use strict';

const MIN_VIDEO_DURATION_SECONDS = 480;
const TARGET_VIDEO_DURATION_SECONDS = 540;
const MIN_TOTAL_VOICEOVER_WORDS = 900;
const MIN_SCENES = 8;
const MIN_TOTAL_DEMO_STEPS = 18;
const MIN_VISUAL_ANCHORS = 14;
const MIN_STEP_VERBS = 30;

const REQUIRED_STEP_VERBS = [
  'click',
  'open',
  'select',
  'choose',
  'add',
  'create',
  'enter',
  'paste',
  'type',
  'map',
  'connect',
  'configure',
  'set',
  'test',
  'run',
  'verify',
  'publish',
  'save'
];

const GENERIC_BAD_PHRASES = [
  'streamlines your operations',
  'cuts costs',
  'runs in the background',
  'manual nightmare',
  'highly expensive',
  'virtually free',
  'the results are incredible',
  'absolute perfection',
  'game-changer',
  'massive pain point',
  'ken burns',
  'byte the robot',
  'animated explainer',
  'manual pain',
  'workflow walkthrough',
  'drop a comment today',
  'grab your free playbook',
  'automating your client acquisition today'
];

const REQUIRED_SCRIPT_FIELDS = [
  'demo_steps',
  'visual_plan'
];

function words(text) {
  return String(text || '').match(/\b[\w'-]+\b/g) || [];
}

function countMatches(text, terms) {
  const source = String(text || '').toLowerCase();
  return terms.reduce((count, term) => count + (source.includes(term) ? 1 : 0), 0);
}

function countStepVerbs(text) {
  const wordsList = String(text || '').toLowerCase().match(/\b[a-z'-]+\b/g) || [];
  return wordsList.filter(w => REQUIRED_STEP_VERBS.includes(w)).length;
}

function sceneDemoSteps(scene) {
  return Array.isArray(scene.demo_steps) ? scene.demo_steps : [];
}

function sceneVisualAnchors(scene) {
  const anchors = [];
  for (const step of sceneDemoSteps(scene)) {
    if (step && step.visual_anchor) anchors.push(String(step.visual_anchor));
    if (step && step.ui_target) anchors.push(String(step.ui_target));
  }
  const visual = scene.visual_plan || {};
  for (const key of ['screen_type', 'foreground_elements', 'cursor_action', 'zoom_target', 'on_screen_text']) {
    const value = visual[key];
    if (Array.isArray(value)) anchors.push(...value.map(String));
    else if (value) anchors.push(String(value));
  }
  if (scene.visual_note) anchors.push(String(scene.visual_note));
  return anchors.filter(Boolean);
}

function analyzeScriptQuality(script) {
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  const voiceoverText = scenes.map(scene => scene.voiceover || '').join('\n');
  const demoSteps = scenes.flatMap(sceneDemoSteps);
  const visualAnchors = scenes.flatMap(sceneVisualAnchors);
  const allText = JSON.stringify(script || {});
  const wordCount = words(voiceoverText).length;
  const stepVerbCount = countStepVerbs(allText);
  const badPhraseHits = GENERIC_BAD_PHRASES.filter(phrase => allText.toLowerCase().includes(phrase));
  const missingSceneFields = [];

  for (const scene of scenes) {
    for (const field of REQUIRED_SCRIPT_FIELDS) {
      if (!scene[field] || (Array.isArray(scene[field]) && scene[field].length === 0)) {
        missingSceneFields.push(`scene ${scene.scene_number || '?'} missing ${field}`);
      }
    }
  }

  const failures = [];
  const warnings = [];

  if (scenes.length < MIN_SCENES) {
    failures.push(`Script has ${scenes.length} scene(s); minimum is ${MIN_SCENES} for an 8+ minute demonstration.`);
  }
  if (wordCount < MIN_TOTAL_VOICEOVER_WORDS) {
    failures.push(`Narration has ${wordCount} words; minimum is ${MIN_TOTAL_VOICEOVER_WORDS} so the video is not padded with silence.`);
  }
  if (demoSteps.length < MIN_TOTAL_DEMO_STEPS) {
    failures.push(`Script has ${demoSteps.length} concrete demo step(s); minimum is ${MIN_TOTAL_DEMO_STEPS}.`);
  }
  if (visualAnchors.length < MIN_VISUAL_ANCHORS) {
    failures.push(`Script has ${visualAnchors.length} UI/visual anchor(s); minimum is ${MIN_VISUAL_ANCHORS}.`);
  }
  if (stepVerbCount < MIN_STEP_VERBS) {
    failures.push(`Script uses ${stepVerbCount} actionable build verb(s); minimum is ${MIN_STEP_VERBS}.`);
  }
  if (badPhraseHits.length) {
    failures.push(`Generic/low-value phrase(s) found: ${badPhraseHits.join(', ')}.`);
  }
  if (missingSceneFields.length) {
    failures.push(`Missing required instructional fields: ${missingSceneFields.slice(0, 8).join('; ')}${missingSceneFields.length > 8 ? '...' : ''}.`);
  }

  for (const step of demoSteps) {
    if (!step.exact_instruction || !step.expected_result) {
      warnings.push('One or more demo steps lack exact_instruction or expected_result.');
      break;
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    warnings,
    metrics: {
      scenes: scenes.length,
      voiceover_words: wordCount,
      demo_steps: demoSteps.length,
      visual_anchors: visualAnchors.length,
      actionable_build_verbs: stepVerbCount,
      bad_phrase_hits: badPhraseHits
    }
  };
}

const STRICT_DEMO_PROMPT = `
SaaS Autopilot strict instructional standard:
- Minimum runtime is ${MIN_VIDEO_DURATION_SECONDS} seconds; target ${TARGET_VIDEO_DURATION_SECONDS} seconds.
- Minimum narration is ${MIN_TOTAL_VOICEOVER_WORDS} words. Do not stretch the video with silent padding.
- Build a real follow-along demonstration, not a marketing explainer.
- Show the finished workflow in the first 20 seconds, then rebuild it step by step.
- Every scene must include demo_steps and visual_plan.
- Demo steps must say what to click, what to enter, what to connect/map, what to test, and what result to verify.
- Use specific UI anchors: menu names, node names, field names, buttons, sample payloads, output panels, error logs, and test results.
- Include at least one failed test or edge case and show the fix.
- Avoid generic hype, mascot slides, Ken Burns filler, problem-only storytelling, and claims that are not demonstrated on screen.
`.trim();

module.exports = {
  MIN_VIDEO_DURATION_SECONDS,
  TARGET_VIDEO_DURATION_SECONDS,
  MIN_TOTAL_VOICEOVER_WORDS,
  MIN_SCENES,
  MIN_TOTAL_DEMO_STEPS,
  MIN_VISUAL_ANCHORS,
  MIN_STEP_VERBS,
  REQUIRED_STEP_VERBS,
  GENERIC_BAD_PHRASES,
  STRICT_DEMO_PROMPT,
  analyzeScriptQuality
};
