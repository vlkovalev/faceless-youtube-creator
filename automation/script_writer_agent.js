/**
 * script_writer_agent.js — Autonomous LLM Script Writer
 * =======================================================
 * Uses the Anthropic API to auto-write complete voiceover scripts
 * from topic briefs. No human input required.
 *
 * Supports all 3 channels:
 *   --channel cs        Corporate Shadows (dark corporate documentary)
 *   --channel saints    The Saints (Orthodox hagiography documentary)
 *   --channel SAAS_AUTOPILOT    SaaS Autopilot Automation (workflow tutorial)
 *
 * Usage:
 *   node automation/script_writer_agent.js --channel cs --topic-id 6
 *   node automation/script_writer_agent.js --channel saints --topic-id 13
 *   node automation/script_writer_agent.js --channel SAAS_AUTOPILOT --topic-id SAAS-001
 *   node automation/script_writer_agent.js --channel cs --topic-id 7 --dry-run
 *
 * Requires:
 *   ANTHROPIC_API_KEY env var in automation/credentials/.env
 *
 * Output:
 *   CS:     scripts/video_N_data.js         (window.SCRIPTS[N] format)
 *   Saints: scripts/saints_video_N_data.js  (window.SAINTS_SCRIPTS[N] format)
 *   SaaS Autopilot: scripts/SAAS_AUTOPILOT/saas_N_data.json
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, 'credentials', '.env') });

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const ROOT        = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

const { callLLM } = require('./tools/llm_client');

// ── Config ────────────────────────────────────────────────────────────────────
const MODEL             = 'claude-sonnet-4-6';
const MAX_TOKENS        = 8000;

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    acc[key] = (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[++i] : true;
  }
  return acc;
}, {});

const CHANNEL  = (args.channel || 'cs').toLowerCase();
const TOPIC_ID = args['topic-id'] || args.topic || args.id;
const DRY_RUN  = args['dry-run'] === true || args['dry-run'] === 'true';

// ── Channel prompts ───────────────────────────────────────────────────────────

const CS_SYSTEM = `You are a documentary scriptwriter for "Corporate Shadows" — a dark business history YouTube channel.
Your job: write a complete, engaging, scene-by-scene voiceover script in the exact JSON format provided.

Style rules:
- Hook viewers in Scene 1 with a shocking fact or outrage-inducing revelation within the first 3 sentences.
- Each scene builds tension. Never give away the full picture until the final scene.
- Write at a 130-word-per-minute pace. Target 1250–1600 total words for an 8–12 minute video.
- Use short punchy sentences mixed with longer rhythmic ones. Vary cadence.
- Mark dramatic pauses as: <span class="pause">...</span>
- Mark key terms/names as: <span class="emphasis">term</span>
- Every scene must be grounded in real, verifiable history. No fabricated facts.
- End on a reflective note about what this event reveals about corporate power, greed, or human nature.

Output ONLY valid JSON — no markdown, no code fences, no explanation.`;

const SAINTS_SYSTEM = `You are a documentary scriptwriter for "The Saints" — a YouTube channel about Orthodox Christian saints.
Your job: write a complete, reverential, scene-by-scene voiceover script in the exact JSON format provided.

Style rules:
- Tone is warm, contemplative, and deeply respectful. Never sensational.
- Scene 1 opens with a detail that makes the saint feel immediate and human — a single moment, place, or practice.
- Ground miracles and spiritual experiences in the historical record. Clearly distinguish historical fact from tradition.
- You MUST write exactly 14 scenes.
- Target 1400–1700 total words for a minimum 8-minute video (compensating for fast narration pace). Each scene's voiceover must be around 100-120 words.
- Write at ~130 words per minute. Mark pauses as: <span class="pause">...</span>
- Mark saint names and key theological terms as: <span class="emphasis">term</span>
- Each scene should leave the viewer with one clear spiritual insight, historical fact, or human detail.
- Final scene ties the saint's life to what a modern viewer can take away.

Output ONLY valid JSON — no markdown, no code fences, no explanation.`;

const SAAS_AUTOPILOT_SYSTEM = `You are a scriptwriter for an SaaS Autopilot automation YouTube channel.
Your job: write a complete, practical, scene-by-scene voiceover script in the exact JSON format provided.

Style rules:
- Open on the END RESULT — state the outcome in the first sentence. "Here is what I built. It saves 3 hours a week and costs $0.02 to run."
- Be specific. Name the tools, the steps, the numbers. Never be vague.
- Target 900–1200 total words for an 8–10 minute video.
- Fast pacing. Short sentences. Conversational but competent.
- Every claim must be demonstrable in the video. No hype.
- The viewer should be able to replicate the workflow after watching.
- CTA must be specific: tell them exactly what to do next (get the code, subscribe for next workflow, etc.)

Output ONLY valid JSON — no markdown, no code fences, no explanation.`;

// ── Format templates ──────────────────────────────────────────────────────────

function csPrompt(topic) {
  return `Write a complete Corporate Shadows script for this topic:

Title: ${topic.title}
Topic: ${topic.topic}
Hook concept: ${topic.hook}
Difficulty: ${topic.difficulty}
Target duration: ${topic.duration || '9-11 minutes'}

Required scene structure (write ALL scenes, minimum 6):
1. The Hook — open with the most shocking or outrage-inducing fact. Named individual required in first 3 scenes.
2. The Setup — historical context, who the players are
3. The Crime — what they actually did
4. The Mechanism — HOW they did it (the specific tactics, cover-ups, bribes, marketing tricks)
5. The Consequences — who was hurt, the scale of damage
6. The Reckoning — what happened to the perpetrators
7. The Legacy — what this reveals about corporate power today

Output this exact JSON structure (no markdown wrappers):
{
  "video": { "title": "...", "niche": "Dark Business History", "duration": "..." },
  "scenes": [
    {
      "scene_number": 1,
      "title": "...",
      "voiceover": "...",
      "visual_prompt": "Soul Cinema style, dark cinematic, [description of key visual]",
      "camera_movement": "...",
      "sound_effect": "...",
      "pacing_note": "..."
    }
  ]
}`;
}

function saintsPrompt(topic) {
  return `Write a complete, highly detailed The Saints script for this topic:

Title: ${topic.title}
Saint: ${topic.topic}
Episode number: ${topic.script_id || topic.id}

You MUST write exactly 14 scenes. Each scene's voiceover must be at least 100-120 words to ensure the overall script is long enough for an 8-10 minute video.
Required 14-scene hagiography structure:
1. The Opening Hook / Introduction — Establish the spiritual atmosphere and the saint's enduring memory.
2. Early Life & Family — Birth, pious upbringing, parents, childhood signs of holiness.
3. Spiritual Awakening & Search — Formative holy readings, pilgrimages, decision to leave the world.
4. Entering Monastic Life — Tonsure, early obedience, finding a spiritual father or elder.
5. Early Labors & Humility — Daily physical work, fasting, silence, subduing the ego.
6. Trials, Temptations, & Demonic Attacks — Severe spiritual warfare, doubt, physical illness, slander.
7. Seeking Solitude / Hesychasm — Withdrawing to the wilderness, silent contemplative prayer, the Jesus Prayer.
8. The Fruits of Prayer / Miracles — Uncreated Light, clairvoyance, healing of pilgrims, spiritual peace.
9. Disciples & Spiritual Direction — Guiding others, building a community or monastery.
10. Final Labors / Preparing for Repose — Aging in the monastery, foreknowledge of departure, last counsels.
11. Peaceful Repose (Falling Asleep in the Lord) — The saint's holy death, the scent of holiness, peace of the brethren.
12. Miracles at the Tomb / Translation of Relics — Post-mortem miracles, finding incorrupt relics.
13. Historical Veneration & Influence — Canonization, liturgical memory, spreading of their teaching.
14. The Modern Takeaway / Spiritual Lesson — Practical advice for a modern Christian seeking peace of heart.

Output this exact JSON structure (no markdown wrappers):
{
  "video": { "title": "...", "niche": "Orthodox Christian History", "duration_target": "10-12 minutes" },
  "scenes": [
    {
      "scene_number": 1,
      "title": "...",
      "voiceover": "...",
      "visual_prompt": "Reverential documentary style, warm icon lighting, [description]",
      "camera_movement": "...",
      "sound_effect": "Byzantine chant, low and distant",
      "pacing_note": "..."
    }
  ]
}`;
}

function saasAutopilotPrompt(topic) {
  return `Write a complete SaaS Autopilot automation tutorial script for this topic:

Title: ${topic.title}
Topic: ${topic.topic}
Hook: ${topic.hook}
Difficulty: ${topic.difficulty}

Required scene structure (write ALL 6 scenes):
1. The Hook (0:00–0:30) — open on the result. State what was built, what it saves.
2. The Problem (0:30–1:30) — the manual pain this replaces. Specific tools, steps, time cost.
3. The Stack (1:30–2:30) — every tool used. Name, version/tier, cost per run.
4. The Build (2:30–6:00) — step-by-step walkthrough. Include one thing that went wrong and how it was fixed.
5. The Results (6:00–7:00) — specific numbers: time before vs after, cost per run, error rate.
6. The CTA (7:00–end) — exactly what the viewer should do next.

Output this exact JSON structure (no markdown wrappers):
{
  "video": { "id": "${topic.id}", "title": "...", "topic": "...", "status": "script_complete" },
  "scenes": [
    {
      "scene_number": 1,
      "title": "...",
      "type": "hook",
      "voiceover": "...",
      "visual_type": "screen_recording",
      "visual_note": "...",
      "pacing_note": "..."
    }
  ],
  "metadata": {
    "primary_keyword": "...",
    "description_template": "...",
    "tags": ["AI automation", "B2B SaaS", "workflow automation"],
    "thumbnail_concept": "..."
  }
}`;
}

// callClaude removed. callLLM from llm_client is used instead.

function loadTopic(channel, topicId) {
  if (channel === 'cs') {
    const configPath = fs.existsSync(path.join(ROOT, 'channel_config.json'))
      ? path.join(ROOT, 'channel_config.json')
      : path.join(ROOT, 'Corporate Shadows', 'channel_config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const idea = config.viral_ideas.find(v => String(v.id) === String(topicId));
    if (!idea) throw new Error(`CS topic ID ${topicId} not found in channel_config.json viral_ideas`);
    return idea;
  }
  if (channel === 'saints') {
    const slate = JSON.parse(fs.readFileSync(path.join(ROOT, 'metadata', 'next_slate.json'), 'utf8'));
    const ep = slate.the_saints.find(s => s.script_id === Number(topicId) || String(s.id) === `SAINTS-0${topicId}`);
    if (!ep) throw new Error(`Saints topic ID ${topicId} not found in metadata/next_slate.json`);
    return ep;
  }
  if (channel === 'SAAS_AUTOPILOT') {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'SAAS_AUTOPILOT_channel_config.json'), 'utf8'));
    const idea = config.topic_backlog.find(t => t.id.toUpperCase() === String(topicId).toUpperCase());
    if (!idea) throw new Error(`SaaS Autopilot topic ${topicId} not found in SAAS_AUTOPILOT_channel_config.json`);
    return idea;
  }
  throw new Error(`Unknown channel: ${channel}. Use: cs, saints, SAAS_AUTOPILOT`);
}

// ── Output writer ─────────────────────────────────────────────────────────────
function writeScript(channel, topicId, scriptJson) {
  if (channel === 'cs') {
    const outPath = path.join(SCRIPTS_DIR, `video_${topicId}_data.js`);
    const content = `window.SCRIPTS = window.SCRIPTS || {};\nwindow.SCRIPTS[${topicId}] = ${JSON.stringify(scriptJson, null, 2)};`;
    fs.writeFileSync(outPath, content);
    return outPath;
  }
  if (channel === 'saints') {
    const outPath = path.join(ROOT, 'The Saints', 'scripts', `saints_video_${topicId}_data.js`);
    const content = `window.SAINTS_SCRIPTS = window.SAINTS_SCRIPTS || {};\nwindow.SAINTS_SCRIPTS[${topicId}] = ${JSON.stringify(scriptJson, null, 2)};`;
    fs.writeFileSync(outPath, content);
    return outPath;
  }
  if (channel === 'SAAS_AUTOPILOT') {
    const scriptId = String(topicId).toLowerCase().replace(/[^a-z0-9]/g, '_');
    const dir = path.join(SCRIPTS_DIR, 'SAAS_AUTOPILOT');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, `${scriptId}_data.json`);
    fs.writeFileSync(outPath, JSON.stringify(scriptJson, null, 2));
    return outPath;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!TOPIC_ID) {
    console.error('❌  Usage: node automation/script_writer_agent.js --channel cs --topic-id 6');
    process.exit(1);
  }
  const hasKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!hasKey && !DRY_RUN) {
    console.error('❌  No LLM API keys set. Please set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in automation/credentials/.env');
    process.exit(1);
  }

  console.log(`\n✍️  Script Writer Agent`);
  console.log(`   Channel : ${CHANNEL}`);
  console.log(`   Topic ID: ${TOPIC_ID}`);
  if (DRY_RUN) console.log(`   Mode    : DRY RUN\n`);

  const topic = loadTopic(CHANNEL, TOPIC_ID);
  console.log(`   Title   : ${topic.title || topic.name || topic.topic}`);

  const systemPrompt = { cs: CS_SYSTEM, saints: SAINTS_SYSTEM, SAAS_AUTOPILOT: SAAS_AUTOPILOT_SYSTEM }[CHANNEL];
  const userPrompt   = { cs: csPrompt, saints: saintsPrompt, SAAS_AUTOPILOT: saasAutopilotPrompt }[CHANNEL](topic);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would call LLM API with:');
    console.log('--- SYSTEM ---');
    console.log(systemPrompt.slice(0, 200) + '...');
    console.log('--- USER ---');
    console.log(userPrompt.slice(0, 300) + '...');
    return;
  }

  console.log('\n⏳  Calling LLM API...');
  const raw = await callLLM(systemPrompt, userPrompt);

  // Strip any accidental markdown code fences
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let scriptJson;
  try {
    scriptJson = JSON.parse(cleaned);
  } catch (e) {
    console.error('❌  API returned invalid JSON. Raw output saved to metadata/script_writer_error.txt');
    fs.writeFileSync(path.join(ROOT, 'metadata', 'script_writer_error.txt'), raw);
    throw new Error(`JSON parse failed: ${e.message}`);
  }

  const outPath = writeScript(CHANNEL, TOPIC_ID, scriptJson);
  const sceneCount = (scriptJson.scenes || []).length;
  const wordCount  = (scriptJson.scenes || []).reduce((n, s) => {
    const clean = (s.voiceover || '').replace(/<[^>]+>/g, '');
    return n + clean.split(/\s+/).filter(Boolean).length;
  }, 0);

  console.log(`\n✅  Script written to: ${outPath}`);
  console.log(`   Scenes    : ${sceneCount}`);
  console.log(`   Word count: ${wordCount} (~${Math.round(wordCount / 130)} min at 130 wpm)`);
  console.log(`\n📋  Next: node automation/master_autopilot.js --channel ${CHANNEL} --topic-id ${TOPIC_ID} --stage tts`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
