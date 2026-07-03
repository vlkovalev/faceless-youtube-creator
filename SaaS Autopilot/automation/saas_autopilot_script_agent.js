/**
 * SaaS Autopilot Script Generation Agent
 * ================================
 * Takes a topic ID from saas_autopilot_channel_config.json and generates a
 * complete, fully-written, scene-by-scene script JSON file.
 *
 * Supports BOTH:
 *   1. Online Mode  — Call Anthropic Claude 3.5 Sonnet to write customized, professional scripts.
 *   2. Offline Mode — Local high-quality script generation engine with realistic, pre-written B2B
 *                      workflow copy tailored to each backlog topic (SAAS-001 to SAAS-005).
 *
 * Usage:
 *   node automation/saas_autopilot_script_agent.js --topic SAAS-003
 *   node automation/saas_autopilot_script_agent.js --topic SAAS-003 --dry-run
 *
 * Output:
 *   scripts/saas_autopilot/saas_003_data.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const {
  STRICT_DEMO_PROMPT,
  MIN_VIDEO_DURATION_SECONDS,
  TARGET_VIDEO_DURATION_SECONDS,
  MIN_TOTAL_VOICEOVER_WORDS,
  analyzeScriptQuality
} = require('./saas_autopilot_quality_standard');

const AUTOMATION_DIR = __dirname;
const WORKSPACE_DIR = path.join(AUTOMATION_DIR, '..');
const CONFIG_PATH   = path.join(WORKSPACE_DIR, 'saas_autopilot_channel_config.json');
const SCRIPTS_DIR   = path.join(WORKSPACE_DIR, 'scripts', 'saas_autopilot');
const ASSETS_DIR    = path.join(WORKSPACE_DIR, 'assets', 'saas_autopilot_assets');
const ENV_PATH      = path.join(AUTOMATION_DIR, 'credentials', '.env');
const BLUEPRINT_DOWNLOAD_URL = process.env.SAAS_AUTOPILOT_BLUEPRINT_URL || 'https://drive.google.com/uc?id=1d-ulBGFgzTbIhOERg9n3OSFryNfaHt1P&export=download';

// Load environment variables from credentials/.env
require('dotenv').config({ path: ENV_PATH });

const { callLLM } = require('../../automation/tools/llm_client');
const MODEL             = 'claude-3-5-sonnet-20241022';
const MAX_TOKENS        = 4000;

// ── CLI args ────────────────────────────────────────────────────────────────
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

// ── Claude System Prompt ──────────────────────────────────────────────────────
const SCRIPT_WRITER_SYSTEM_PROMPT = `You are an elite scriptwriter for "SaaS Autopilot" — a practical B2B AI automation YouTube channel.
Your job: write a complete, professional, scene-by-scene voiceover script in the exact JSON format provided.

Style rules:
- Create a strict, step-by-step SaaS automation demonstration. The viewer must see exactly what to click, what to enter, what to connect, what to test, and what result to verify.
- Do not write long problem descriptions. Do not explain why automation matters in general. Do not create vague theory. Do not create marketing-style scenes.
- Be specific. Name every tool, field, node, API action, test input, and expected output.
- Pacing: practical, direct, and demonstration-focused.
- Ensure the viewer feels they can replicate the exact system after watching.
- Ensure the CTA is specific and points to the link in the description.
- Do not rely on YouTube end screens. Put download/code/comment instructions first, then include this verbal close: "This channel needs your support. Please subscribe, leave a word of appreciation for the author, and may God bless you."

Output ONLY valid JSON — do not wrap it in markdown code fences, do not write explanations.`;

function buildUserPrompt(topic) {
  return `Write a complete SaaS Autopilot automation tutorial script for this topic:

Topic ID: ${topic.id}
Title: ${topic.title}
Topic Theme: ${topic.topic}
Angle: ${topic.angle}
Hook Concept: ${topic.hook}
Difficulty: ${topic.difficulty}

Required scene structure (exactly 6 scenes):
1. Create the workflow — what to click first, what to name it, and which app/workspace to open.
2. Add the trigger — exact trigger node, webhook, event, or schedule to create.
3. Map the data fields — exact fields, sample values, and transformations.
4. Connect the AI/action step — exact prompt/API/action settings and required schema.
5. Route the result — exact destination app, fields, message, record, or task to create.
6. QA and publish — exact tests, expected result, failure check, and download/CTA.

Output this exact JSON structure:
{
  "video": {
    "id": "${topic.id}",
    "title": "${topic.title}",
    "topic": "${topic.topic}",
    "status": "script_complete"
  },
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
    "primary_keyword": "${topic.topic}",
    "description_template": "...",
    "tags": ["AI automation", "B2B SaaS", "workflow automation"],
    "thumbnail_concept": "..."
  }
}`;
}

// ── Online Claude Scriptwriter ───────────────────────────────────────────────
const STRICT_SCRIPT_WRITER_SYSTEM_PROMPT = `${SCRIPT_WRITER_SYSTEM_PROMPT}

Hard quality gate for every generated script:
${STRICT_DEMO_PROMPT}

The script must be useful as a screen-recording shot list. If a viewer cannot follow it click by click, the script is a failure.`;

function buildStrictUserPrompt(topic) {
  return `Write a complete SaaS Autopilot automation tutorial script for this topic:

Topic ID: ${topic.id}
Title: ${topic.title}
Topic Theme: ${topic.topic}
Angle: ${topic.angle}
Hook Concept: ${topic.hook}
Difficulty: ${topic.difficulty}

Required structure: exactly 8 scenes, target ${TARGET_VIDEO_DURATION_SECONDS} seconds, minimum ${MIN_VIDEO_DURATION_SECONDS} seconds, minimum ${MIN_TOTAL_VOICEOVER_WORDS} narration words.

Scene plan:
1. Finished result preview: show the completed workflow run, final output, and downloadable materials.
2. Workspace setup: show the app/project/workspace to open, what to name, and which accounts/credentials are required.
3. Trigger build: show the trigger node, webhook, event, schedule, or form intake.
4. Input schema and sample data: show fields, sample values, JSON/body/table columns, and validation rules.
5. Transform and mapping: show field mappings, filters, conditions, expressions, and naming conventions.
6. AI/API/action configuration: show prompt/API/action settings, schema, model/tool choices, and connection details.
7. Test, debug, and edge case: run a happy path plus one bad input; show the error and exact fix.
8. Publish and handoff: enable the workflow, alerts/logging, downloadable PDF/materials, and CTA.

Every scene must include:
- voiceover: 115-170 spoken words.
- demo_steps: at least 2 concrete steps with timestamp, action_type, ui_target, exact_instruction, sample_input, expected_result, and visual_anchor.
- visual_plan: screen_type, foreground_elements, cursor_action, zoom_target, on_screen_text, and data_panels.

Output this exact JSON structure:
{
  "video": {
    "id": "${topic.id}",
    "title": "${topic.title}",
    "topic": "${topic.topic}",
    "status": "script_complete"
  },
  "production": {
    "format": "screen_recorded_step_by_step_demo",
    "style": "strict follow-along tutorial with real UI anchors, live test runs, and no static filler",
    "target_duration_seconds": ${TARGET_VIDEO_DURATION_SECONDS},
    "minimum_duration_seconds": ${MIN_VIDEO_DURATION_SECONDS}
  },
  "scenes": [
    {
      "scene_number": 1,
      "title": "...",
      "type": "result_preview",
      "voiceover": "...",
      "visual_type": "screen_recording",
      "visual_note": "...",
      "pacing_note": "...",
      "demo_steps": [
        {
          "timestamp": "0:00",
          "action_type": "click|enter|connect|map|test|verify",
          "ui_target": "Exact button/menu/field/node/panel",
          "exact_instruction": "Click/enter/connect/test this exact thing.",
          "sample_input": "Concrete payload, field value, prompt, or test record.",
          "expected_result": "What should appear after the action.",
          "visual_anchor": "What the viewer should visually look at on screen."
        }
      ],
      "visual_plan": {
        "screen_type": "screen_recording",
        "foreground_elements": ["..."],
        "cursor_action": "...",
        "zoom_target": "...",
        "on_screen_text": "...",
        "data_panels": ["..."]
      }
    }
  ],
  "metadata": {
    "primary_keyword": "${topic.topic}",
    "description_template": "...",
    "tags": ["AI automation", "B2B SaaS", "workflow automation"],
    "thumbnail_concept": "..."
  }
}`;
}

// callClaude removed. callLLM from llm_client is used instead.

// ── Offline Custom Script Generator Fallback ──────────────────────────────────
function generateOfflineScript(topic) {
  const scriptId = topic.id;
  
  // Custom high-quality, pre-written script segments for B2B topics (SAAS-001 to SAAS-005)
  // This guarantees highly authentic, robust workflow scripts offline with zero placeholders.
  const customVoiceovers = {
    'SAAS-001': {
      s1: "Here's what I built. A fully autonomous system that writes, voices, edits, and schedules YouTube videos while I sleep. It saves about forty hours of production time every single week, and costs under fifty cents per video to run. In this video, I'm going to pull back the curtain and show you the exact architecture behind our channel portfolio.",
      s2: "Before this automation, producing even a single video was a logistical nightmare. It meant writing the script manually, hiring voice actors, recording screen captures, coordinating editing timelines, and scheduling uploads. It took fifteen hours per video, cost hundreds of dollars, and was highly prone to delays. The process was completely unsustainable.",
      s3: "Here is the exact stack we are using to solve this: the Claude three point five Sonnet API for script generation, ElevenLabs Creator plan for professional voiceovers, custom Node.js scripts running locally, and FFmpeg for visual compiling. The total cost is under fifty cents per complete video run.",
      s4: "Let's walk through the architecture. First, our Node script loads our channel configuration backlog. Next, it sends a highly-engineered system prompt to Claude to draft the narrative script. Once the JSON output is parsed, it sends the voiceover text to ElevenLabs. Finally, FFmpeg overlays the voiceover with centered zoom-pan animations.",
      s5: "The metrics are incredible. What used to take fifteen hours of manual coordination now executes in under four minutes. The total video cost dropped from three hundred dollars in labor to just forty-eight cents in API usage. Best of all, it runs on a simple command line, completely eliminating human friction.",
      s6: "The complete codebase and deployment configuration are linked in the description below. Clone the repository, add your credentials, and comment with your specific automation use case. This channel needs your support. Please subscribe, leave a word of appreciation for the author, and may God bless you."
    },
    'SAAS-002': {
      s1: "Here is what I built. A three-tool automation stack that replaces a three-thousand-dollar monthly marketing agency, runs for under twenty dollars a month, and took about four hours to set up. I am going to show you the exact system we use to run our automated campaigns daily.",
      s2: "Most small business owners throw thousands of dollars at marketing agencies to write social content, draft outreach emails, and compile prospect research. These agencies use junior freelancers, take weeks to deliver drafts, and charge premium fees. You are paying three grand a month for standard, slow execution.",
      s3: "The total cost of this automated system is under twenty dollars a month. We use Claude's Sonnet API for high-level writing, a simple Make dot com account to route our data integrations, and an Airtable database to manage our leads. This replaces a dedicated copywriter and lead analyst.",
      s4: "Let's look at the implementation. First, a scraper extracts fresh business profiles weekly. Then, a webhook routes this data directly into Airtable. When a new lead is detected, Claude drafts a customized, pain-point outreach email targeting their specific industry. Airtable triggers a sending automation immediately.",
      s5: "The comparison speaks for itself. The marketing agency took two weeks to build a list and write a basic template. This automation researches, writes, and deploys hyper-customized emails in forty seconds, at a tiny fraction of the cost, with zero manual list-building or copying.",
      s6: "I have prepared the complete blueprint and integration templates in the playbook in the description. Grab your free playbook download, and drop a comment showing your business model so we can customize it for you. This channel needs your support. Please subscribe, leave a word of appreciation for the author, and may God bless you."
    },
    'SAAS-003': {
      s1: "This AI voice agent just booked three sales calls while I was sleeping. It talks like a human, handles cold outreach objections, and costs under two cents per minute to run. In this video, I'll build it live on screen in fifteen minutes.",
      s2: "Traditional appointment setting is expensive and slow. Hire a virtual assistant and you're paying thousands a month for someone to manually dial leads, handle voicemail, and struggle with time zones. Most of the budget is wasted on unanswered calls.",
      s3: "We build this system using Vapi for the voice engine, n8n to connect our database, and Cal dot com to handle booking. The total infrastructure cost is just a few cents per conversation, with zero monthly retainers.",
      s4: "Here's the technical integration. We configure Vapi with a highly realistic ElevenLabs voice. When a call triggers, Vapi uses webhooks to check client calendar availability. If they agree to book, n8n logs the meeting in Cal dot com.",
      s5: "The speed-to-lead latency is virtually zero. The agent responds instantly, captures objections in real-time, and logs lead details directly to our CRM. It replaces hundreds of hours of manual dialing at a tiny fraction of the cost.",
      s6: "You can download the n8n voice blueprint and Vapi prompts from the description below. Grab your copy, and tell me what voice agent you want us to build next. This channel needs your support. Please subscribe, leave a word of appreciation for the author, and may God bless you."
    },
    'SAAS-004': {
      s1: "Zapier just charged me four hundred dollars for standard email routing. So I deleted my account, bought a four-dollar VPS, and self-hosted my own n8n instance. Here is the exact guide to run unlimited AI tasks for zero platform fees.",
      s2: "No-code automation tools like Make and Zapier hook you in with free tiers, but charge astronomical pricing as your business scales. Every email check, spreadsheet update, or database record run costs you money, creating a massive monthly overhead.",
      s3: "We solve this by self-hosting n8n on a simple virtual private server from Hostinger or Hetzner. We use Docker Compose, a custom SSL domain, and a local PostgreSQL database. The total cost is just four dollars a month for infinite executions.",
      s4: "Let's walk through the terminal setup. We install Docker, configure our DNS records to point to the VPS, write a docker compose YAML file, and start the containers. Within five minutes, we have a secure, production-grade automation engine ready.",
      s5: "The savings are immediate. Running one hundred thousand task executions a month on Zapier costs five hundred dollars. On our self-hosted VPS, it costs exactly four dollars, and we can run multiple parallel AI workers without limits.",
      s6: "The complete Docker compose blueprints and server command sheets are linked in the description. Download the setup files, and stop paying Zapier tax today. This channel needs your support. Please subscribe, leave a word of appreciation for the author, and may God bless you."
    },
    'SAAS-005': {
      s1: "I don't write code, but I built and deployed a fully functional B2B lead enrichment SaaS in two hours using Cursor and Bolt dot new. In this video, I'll walk you through the step-by-step vibe-coding process.",
      s2: "Building a software MVP used to take months of developer hiring, product design, database setup, and endless debugging. Founders spent ten thousand dollars just to get a basic login page working, only to find no one wanted it.",
      s3: "Our development stack is simple: Cursor AI editor for workspace logic, Bolt dot new for instant full-stack environment generation, and Netlify for production hosting. We use natural language to describe features instead of writing code.",
      s4: "Here's the workflow. We ask Bolt dot new to generate a lead enrichment dashboard. It builds the UI, adds mock APIs, and sets up routing. We download the project into Cursor to add the real backend APIs, connecting to a lead database.",
      s5: "Vibe-coding is a complete game-changer. We created a fully styled dashboard, integrated real-time web scraping, and deployed it to a live production domain in under two hours, without writing a single line of syntax manually.",
      s6: "The complete prompt playbook and workspace source code are available in the link below. Download the playbook, and start building your own SaaS today. This channel needs your support. Please subscribe, leave a word of appreciation for the author, and may God bless you."
    },
    'SAAS-006': {
      s1: "Millions of businesses run on messaging platforms, but sales reps cannot reply instantly. I built a Telegram AI agent connected to Claude and Google Sheets that automatically qualifies leads, handles B2B objections, and books meetings while you sleep.",
      s2: "In modern sales, response speed is everything. If a prospect messages your business and waits an hour for a reply, they have already gone to a competitor. But hiring a 24/7 support team to monitor messaging chats is highly expensive.",
      s3: "We build this messaging agent using Node.js, the Telegram Bot API, the Anthropic Sonnet SDK, and Google Sheets to store conversation logs and qualified leads. The total monthly API running cost is under three dollars.",
      s4: "The logic is simple. When a prospect messages the bot, n8n routes the message to Claude. Claude evaluates their business size, checks if they qualify as a lead, writes a personalized B2B response, and updates the Google Sheet status.",
      s5: "The results are impressive. Our Telegram agent responds to incoming queries in under three seconds, answers product objections perfectly, and books qualified leads directly into our calendar without requiring any manual sales labor.",
      s6: "You can grab the full Telegram agent source code and sheet templates in the playbook below. Download the boilerplate, and start automating your client acquisition today. This channel needs your support. Please subscribe, leave a word of appreciation for the author, and may God bless you."
    },
    'SAAS-007': {
      s1: "B2B buyers are no longer searching Google. They are asking ChatGPT, Claude, and Perplexity for software and vendor recommendations. In this video, I will show you the exact strategy to optimize your brand so AI engines recommend you first.",
      s2: "Traditional search engine optimization is dying. Blog posts, keyword stuffing, and backlink networks don't work when users ask ChatGPT 'what is the best AI tool for my agency'. The AI doesn't show Google search results; it summarizes its training data.",
      s3: "We use a Generative Engine Optimization strategy. We crawl top-ranking articles, analyze LLM citation patterns, format our site metadata for LLM crawlers, and seed semantic mentions across high-domain platforms. This shapes how AI perceives our brand.",
      s4: "Here is the technical execution. We edit our schema markup, create clean XML datasets for web crawlers, analyze how Claude summarizes our product description, and run test queries on major AI engines to measure our recommendation rank.",
      s5: "By implementing these optimization steps, our software tool jumped from unlisted to the top recommendation for five high-intent AI search queries. We got high-quality B2B trials for absolutely zero ad spend.",
      s6: "Our complete GEO auditing sheet and meta optimization template are linked in the description below. Grab your free audit template, and start ranking on AI engines today. This channel needs your support. Please subscribe, leave a word of appreciation for the author, and may God bless you."
    }
  };

  const vo = customVoiceovers[scriptId] || {
    s1: `Here is the automated workflow I built for ${topic.title}. It streamlines your operations, cuts costs, and runs in the background.`,
    s2: `Before this system, teams spent hours managing this manually. It was slow, error-prone, and highly expensive.`,
    s3: `Our automated stack utilizes standard B2B developer tools, Claude API, and a simple local database. Total cost is virtually free.`,
    s4: `Let's dive into the technical details of the build. We configure the webhook, set up data selectors, and chain API actions.`,
    s5: `The results are incredible. Execution time dropped by ninety percent, while output reliability reached absolute perfection.`,
    s6: `The full boilerplate and playbook are linked in the description. Download the code, and drop a comment today. This channel needs your support. Please subscribe, leave a word of appreciation for the author, and may God bless you.`
  };

  return {
    _generated_at: new Date().toISOString(),
    _format: 'SAAS_AUTOPILOT_v1',
    _agent: 'saas_autopilot_script_agent.js (Offline Fallback)',
    channel: 'SaaS Autopilot',
    video: {
      id: topic.id,
      title: topic.title,
      topic: topic.topic,
      angle: topic.angle,
      hook: topic.hook,
      target_ctr: topic.target_ctr,
      difficulty: topic.difficulty,
      status: 'script_complete'
    },
    production: {
      format: 'workflow_walkthrough',
      style: 'Ken Burns animated slides featuring Byte the Robot. Narration first, results-focused.',
      voice_backend: 'elevenlabs',
      target_duration_seconds: 540,
      minimum_duration_seconds: 480,
      assets_dir: `assets/saas_autopilot_assets/${scriptId.toLowerCase()}/`
    },
    scenes: [
      {
        scene_number: 1,
        title: 'The Hook (0:00–0:30)',
        type: 'hook',
        voiceover: vo.s1,
        visual_type: 'image',
        visual_note: 'Introduce Byte the Robot in a confident, welcoming pose showing the main pipeline metrics overlay.',
        pacing_note: 'Fast, engaging opening.'
      },
      {
        scene_number: 2,
        title: 'The Problem (0:30–1:30)',
        type: 'problem',
        voiceover: vo.s2,
        visual_type: 'image',
        visual_note: 'Byte looking overwhelmed by manual files, showing chaotic workflows.',
        pacing_note: 'Clear focus on manual pain.'
      },
      {
        scene_number: 3,
        title: 'The Stack (1:30–2:30)',
        type: 'tools_overview',
        voiceover: vo.s3,
        visual_type: 'image',
        visual_note: 'Byte proudly pointing to the 3-tool workflow stack diagrams.',
        pacing_note: 'Crisp and quick tool naming.'
      },
      {
        scene_number: 4,
        title: 'The Build (2:30–6:00)',
        type: 'workflow_demo',
        voiceover: vo.s4,
        visual_type: 'image',
        visual_note: 'Byte dressed as a developer in front of a sleek terminal showing code execution.',
        pacing_note: 'Highly detailed workflow walkthrough.'
      },
      {
        scene_number: 5,
        title: 'The Results (6:00–7:00)',
        type: 'results',
        voiceover: vo.s5,
        visual_type: 'image',
        visual_note: 'Byte celebrating, with massive green before/after comparison metrics in the background.',
        pacing_note: 'High-energy payoff.'
      },
      {
        scene_number: 6,
        title: 'The CTA (7:00–end)',
        type: 'call_to_action',
        voiceover: vo.s6,
        visual_type: 'image',
        visual_note: 'Byte gesturing towards a subscribe button and a glowing download link.',
        pacing_note: 'Direct call to action.'
      }
    ],
    metadata: {
      primary_keyword: topic.topic,
      description_template: `${topic.hook}\n\n📥 **Download the Blueprint Pack:**\n${BLUEPRINT_DOWNLOAD_URL}\n\nIncludes outreach templates and Make.com blueprint JSON files.\n\n📌 **Key Timestamps:**\n0:00 — Hook\n0:30 — The Problem\n1:30 — The Stack\n2:30 — The Build\n6:00 — Results\n7:00 — Get the Code\n\n#AIAutomation #B2B #ClaudeAI #SaaS #Productivity`,
      tags: ['AI automation', 'B2B SaaS', 'workflow automation', 'Claude 3.5 Sonnet', 'Node.js automation'],
      thumbnail_concept: `Vibrant dark brand background (#0d1117). Bold neon text displaying: "${topic.id === 'SAAS-002' ? '$3,000 → $20' : '40 HOURS → 4 MIN'}". Clean mascot logo.`
    }
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
function inferAutomationStack(topic) {
  const text = `${topic.title || ''} ${topic.topic || ''} ${topic.angle || ''}`.toLowerCase();
  const tools = [];
  if (/n8n/.test(text)) tools.push('n8n');
  if (/make|zapier/.test(text)) tools.push('Make.com');
  if (/slack/.test(text)) tools.push('Slack');
  if (/intercom/.test(text)) tools.push('Intercom');
  if (/hubspot|crm|salesforce/.test(text)) tools.push('CRM');
  if (/sheet|google/.test(text)) tools.push('Google Sheets');
  if (/airtable/.test(text)) tools.push('Airtable');
  if (/calendar|cal\.com/.test(text)) tools.push('Cal.com');
  if (/ticket|support/.test(text)) tools.push('Support inbox');
  if (/ai|claude|gpt|llm/.test(text)) tools.push('Claude API');
  if (!tools.length) tools.push('Webhook', 'Claude API', 'Google Sheets', 'Slack');
  return [...new Set(tools)].slice(0, 5);
}

function generateStrictOfflineScript(topic) {
  const scriptId = topic.id;
  const stack = inferAutomationStack(topic);
  const workflowName = `${topic.title}`.replace(/^I Built an? /i, '').replace(/^How to Build an? /i, '').slice(0, 72);
  const scenes = [
    ['Finished Result Preview', 'result_preview', [
      ['click', 'Execution history / Runs panel', 'Open the latest successful run and expand the final output card.', 'latest run', 'The viewer sees the completed automation result before the build starts.'],
      ['verify', 'Destination app output', 'Open the CRM, sheet, Slack channel, or ticket where the workflow posts its result.', 'generated output', 'The final routed result is visible and ready to inspect.']
    ]],
    ['Workspace Setup', 'workspace_setup', [
      ['click', `${stack[0]} dashboard`, `Open ${stack[0]} and click New workflow or New scenario.`, workflowName, 'A blank workflow canvas is open.'],
      ['enter', 'Workflow name field', `Name the workflow "${workflowName}" and save it before adding nodes.`, workflowName, 'The workflow title is saved at the top of the canvas.'],
      ['connect', 'Credentials panel', `Connect the required accounts: ${stack.join(', ')}.`, stack.join(', '), 'Every required account shows a connected status.']
    ]],
    ['Trigger Build', 'trigger_build', [
      ['click', 'Add trigger node', 'Add the inbound trigger: webhook, schedule, form submission, or app event.', 'new lead / ticket / request', 'The trigger node appears as step one on the canvas.'],
      ['enter', 'Trigger configuration panel', 'Paste the webhook path, event type, or schedule and save the trigger.', '/saas-autopilot-demo', 'A test URL or event listener is active.']
    ]],
    ['Input Schema And Sample Data', 'input_schema', [
      ['enter', 'Sample payload panel', 'Paste a realistic sample record with name, company, priority, source, and request text.', '{"company":"Acme SaaS","priority":"high"}', 'The run log shows each incoming field.'],
      ['verify', 'Schema preview', 'Check that required fields are present and empty fields are marked for fallback handling.', 'missing budget field', 'The schema preview identifies valid and missing values.']
    ]],
    ['Transform And Mapping', 'mapping', [
      ['click', 'Add transform / set fields node', 'Create clean variables for company_name, customer_intent, priority_score, and next_action.', 'mapped fields', 'The transform node contains named outputs.'],
      ['map', 'Field mapping table', 'Map each trigger field into the downstream variable names and add a fallback for missing values.', 'priority = high', 'The preview shows clean normalized JSON.'],
      ['test', 'Preview transformation', 'Run the transform preview with the sample payload.', 'sample run', 'The mapped JSON is ready for the AI or action step.']
    ]],
    ['AI Or API Action Configuration', 'action_configuration', [
      ['click', 'Add AI / HTTP action node', 'Add the AI or API action and choose the model, endpoint, or app action that performs the work.', stack.includes('Claude API') ? 'Claude API' : stack[1] || 'HTTP request', 'The action node is connected after the mapping step.'],
      ['enter', 'Prompt or request body', 'Paste a concise system prompt, inject the mapped variables, and require a structured JSON response.', '{"summary":"","recommended_action":"","confidence":0}', 'The action returns predictable structured output.'],
      ['connect', 'Output schema panel', 'Connect the JSON response fields to downstream routing fields.', 'summary -> Slack message', 'The next node can read each response field.']
    ]],
    ['Test Debug And Edge Case', 'qa_debug', [
      ['test', 'Run once button', 'Run the workflow with the happy-path sample and inspect every node output.', 'valid sample', 'Every node turns green and the destination receives the result.'],
      ['test', 'Manual test payload', 'Run a bad input with a missing company name and an unusually long request.', 'missing company_name', 'The workflow exposes the validation failure.'],
      ['configure', 'Fallback branch / error handler', 'Add a fallback value, an error alert, and a stop condition for unsafe output.', 'company_name = Unknown account', 'The second test completes without corrupting the destination.']
    ]],
    ['Publish And Handoff', 'publish_handoff', [
      ['click', 'Activate / Publish toggle', 'Turn the workflow on only after the test log is clean.', 'publish workflow', 'The automation status changes to active.'],
      ['connect', 'Monitoring or alert node', 'Send failed runs to an alert channel with the run URL and failed node name.', '#automation-alerts', 'Operators can debug failures from one message.'],
      ['verify', 'Downloadable materials folder', 'Open the video folder and confirm the PDF blueprint, templates, and checklist are present.', BLUEPRINT_DOWNLOAD_URL, 'The viewer has the exact materials promised in the description.']
    ]]
  ];

  return {
    _generated_at: new Date().toISOString(),
    _format: 'SAAS_AUTOPILOT_STRICT_DEMO_v2',
    _agent: 'saas_autopilot_script_agent.js (Strict Offline Fallback)',
    channel: 'SaaS Autopilot',
    video: {
      id: topic.id,
      title: topic.title,
      topic: topic.topic,
      angle: topic.angle,
      hook: topic.hook,
      target_ctr: topic.target_ctr,
      difficulty: topic.difficulty,
      status: 'script_complete'
    },
    production: {
      format: 'screen_recorded_step_by_step_demo',
      style: 'strict follow-along tutorial with real UI anchors, live test runs, and no static filler',
      voice_backend: 'elevenlabs',
      target_duration_seconds: TARGET_VIDEO_DURATION_SECONDS,
      minimum_duration_seconds: MIN_VIDEO_DURATION_SECONDS,
      assets_dir: `assets/saas_autopilot_assets/${scriptId.toLowerCase()}/`
    },
    scenes: scenes.map(([title, type, steps], index) => {
      const sceneNumber = index + 1;
      const stepText = steps.map((step, stepIndex) => {
        const [action, target, instruction, input, result] = step;
        return `Step ${stepIndex + 1}: ${instruction} Use "${input}" as the sample input. Confirm this result: ${result}`;
      }).join(' ');
      return {
        scene_number: sceneNumber,
        title: `${title} (${sceneNumber})`,
        type,
        voiceover: `In this section we build ${workflowName} inside ${stack.join(' plus ')}. ${stepText} Keep the screen focused on the exact panel being edited, pause briefly after each save, and say the expected result before moving forward. This is not theory; the viewer should be able to copy the action, compare their screen with ours, and know whether the workflow is working before the next scene starts. If a field name appears on screen, read it clearly and show the completed value.`,
        visual_type: 'screen_recording',
        visual_note: `Record the ${title.toLowerCase()} screen with cursor movement, node panel close-ups, and the run log visible.`,
        pacing_note: 'Direct tutorial pacing: action, input, expected result, then next action.',
        demo_steps: steps.map((step, stepIndex) => {
          const [action, target, instruction, input, result] = step;
          return {
            timestamp: `${Math.floor((sceneNumber - 1) * 1.05)}:${String(stepIndex * 18).padStart(2, '0')}`,
            action_type: action,
            ui_target: target,
            exact_instruction: instruction,
            sample_input: input,
            expected_result: result,
            visual_anchor: `${target} visible with the cursor or zoom focus on the edited field.`
          };
        }),
        visual_plan: {
          screen_type: 'screen_recording',
          foreground_elements: [steps[0][1], steps[steps.length - 1][1], 'run log'],
          cursor_action: steps.map(step => `${step[0]} ${step[1]}`).join('; '),
          zoom_target: steps[0][1],
          on_screen_text: `${title}: click, enter, connect, test, verify`,
          data_panels: ['input payload', 'mapped output', 'execution result']
        }
      };
    }),
    metadata: {
      primary_keyword: topic.topic,
      description_template: `${topic.hook}\n\nDownload the complete PDF blueprint, templates, and workflow checklist:\n${BLUEPRINT_DOWNLOAD_URL}\n\nKey Timestamps:\n0:00 Finished result preview\n1:00 Workspace setup\n2:00 Trigger build\n3:00 Input schema\n4:00 Mapping\n5:10 AI/API action\n6:30 Test and debug\n7:45 Publish and handoff\n\n#AIAutomation #B2BSaaS #WorkflowAutomation #HowTo`,
      tags: ['AI automation', 'B2B SaaS', 'workflow automation', 'SaaS tutorial', 'How-to automation'],
      thumbnail_concept: `Real screen close-up of ${workflowName} workflow canvas with one bold result callout.`
    }
  };
}

async function main() {
  if (!TOPIC_ID) {
    console.error('❌ Error: --topic is required. Example: node automation/saas_autopilot_script_agent.js --topic SAAS-003');
    process.exit(1);
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`❌ Error: saas_autopilot_channel_config.json not found at ${CONFIG_PATH}`);
    process.exit(1);
  }

  const config = readJson(CONFIG_PATH);
  const topic = config.topic_backlog.find(t => t.id.toUpperCase() === TOPIC_ID);

  if (!topic) {
    console.error(`❌ Error: Topic ID "${TOPIC_ID}" not found in saas_autopilot_channel_config.json topic_backlog.`);
    console.error(`   Available IDs: ${config.topic_backlog.map(t => t.id).join(', ')}`);
    process.exit(1);
  }

  const scriptId = topic.id.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const outputPath = path.join(SCRIPTS_DIR, `${scriptId}_data.json`);
  const assetsSubDir = path.join(ASSETS_DIR, scriptId);

  console.log(`\n🤖 SaaS Autopilot Autonomous Script Writer Agent`);
  console.log(`   Topic: ${topic.id} — ${topic.title}`);
  console.log(`   Output: scripts/saas_autopilot/${scriptId}_data.json`);
  if (DRY_RUN) console.log(`   Mode: DRY RUN — no files written\n`);

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would write optimized script JSON to ${outputPath}`);
    return;
  }

  [SCRIPTS_DIR, assetsSubDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  let scriptJson;
  const hasKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (hasKey) {
    console.log(`⏳ Calling LLM API...`);
    try {
      const raw = await callLLM(STRICT_SCRIPT_WRITER_SYSTEM_PROMPT, buildStrictUserPrompt(topic));
      const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      scriptJson = JSON.parse(cleaned);
      console.log(`✅ AI script written successfully via LLM!`);
    } catch (err) {
      console.warn(`⚠️  LLM API error: ${err.message}. Activating Strict Local Offline Fallback...`);
      scriptJson = generateStrictOfflineScript(topic);
      console.log(`✅ Complete script successfully compiled using Strict Local Offline Fallback!`);
    }
  } else {
    console.log(`💡 No LLM API key. Activating Strict Local Offline Fallback...`);
    scriptJson = generateStrictOfflineScript(topic);
    console.log(`✅ Complete script successfully compiled using Strict Local Offline Fallback!`);
  }

  const quality = analyzeScriptQuality(scriptJson);
  if (!quality.passed) {
    console.error('❌ Script failed instructional quality gate:');
    for (const failure of quality.failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  for (const warning of quality.warnings) console.warn(`⚠️  Quality warning: ${warning}`);

  fs.writeFileSync(outputPath, JSON.stringify(scriptJson, null, 2));
  console.log(`💾 Saved to: ${outputPath}`);

  const wordCount = (scriptJson.scenes || []).reduce((n, s) => {
    return n + (s.voiceover || '').split(/\s+/).filter(Boolean).length;
  }, 0);
  console.log(`📊 Stats: ${scriptJson.scenes.length} Scenes, ${wordCount} Words (~${(wordCount / 130).toFixed(1)} mins at 130 wpm)`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
