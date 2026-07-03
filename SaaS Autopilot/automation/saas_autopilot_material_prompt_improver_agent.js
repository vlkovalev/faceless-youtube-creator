/**
 * SaaS Autopilot Material Prompt Improver Agent
 * =============================================
 * Generates prompt-improved, per-video prompt templates for downloadable PDF
 * materials using the local prompt-improver rules only. This agent never calls
 * external LLM APIs, so future downloadable materials do not depend on credits
 * or network availability.
 *
 * Usage:
 *   node automation/saas_autopilot_material_prompt_improver_agent.js
 *   node automation/saas_autopilot_material_prompt_improver_agent.js --dry-run
 */

'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '..');
const SCRIPTS_DIR = path.join(WORKSPACE_DIR, 'scripts', 'saas_autopilot');
const OUTPUT_ROOT = path.join(WORKSPACE_DIR, 'downloadable_materials', 'prompt_improved');
const REPORTS_DIR = path.join(WORKSPACE_DIR, 'metadata', 'qa_reports');

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function workflowTerms(video) {
  const text = [
    video.video && video.video.title,
    video.video && video.video.angle,
    ...(video.scenes || []).map(scene => scene.voiceover)
  ].join(' ').toLowerCase();
  const candidates = [
    'make.com', 'n8n', 'zapier', 'vapi', 'cal.com', 'telegram', 'linkedin',
    'slack', 'google sheets', 'airtable', 'quickbooks', 'claude', 'openai',
    'cursor', 'bolt.new', 'perplexity', 'chatgpt', 'ocr', 'crm'
  ];
  const found = candidates.filter(term => text.includes(term));
  return found.length ? found : ['automation platform', 'LLM', 'spreadsheet', 'notification channel'];
}

function basicPromptForVideo(video) {
  const meta = video.video || {};
  const scenes = (video.scenes || [])
    .map(scene => `${scene.scene_number || ''}. ${cleanText(scene.title)}: ${cleanText(scene.voiceover).slice(0, 260)}`)
    .join('\n');
  return `Create a reusable B2B automation build prompt for the SaaS Autopilot video "${meta.title}" (${meta.id}).

Video promise:
${cleanText(meta.hook || meta.angle || meta.title)}

Likely tool stack:
${workflowTerms(video).join(', ')}

Scene context:
${scenes}

The prompt should help a viewer generate a practical blueprint, implementation plan, test data plan, QA checklist, and go-live checklist for this specific workflow.`;
}

function localImprove(video) {
  const meta = video.video || {};
  const tools = workflowTerms(video).join(', ');
  return `# Prompt-Improved Automation Build Template

Optimized with the local SaaS Autopilot prompt improver rules: clear role, context, variables, workflow, constraints, QA, and output format.

\`\`\`markdown
# ROLE & PERSONA
You are a senior B2B automation architect, prompt engineer, and implementation QA lead.

# CONTEXT & OBJECTIVE
Build a practical automation blueprint for: ${cleanText(meta.title)}

The workflow should help {{target_customer}} reduce {{manual_task}} and produce {{business_outcome}} using this likely stack: ${tools}.

# REQUIRED INPUT VARIABLES
- {{target_customer}}
- {{workflow_goal}}
- {{manual_task}}
- {{business_outcome}}
- {{tool_stack}}
- {{data_source}}
- {{approval_owner}}
- {{risk_level}}

# STEP-BY-STEP WORKFLOW
1. Summarize the business problem in plain language.
2. Map each input source, transformation step, human review point, and final output.
3. Recommend the exact automation modules or API steps needed for {{tool_stack}}.
4. Create sample test data that avoids real customer information.
5. Define error handling for missing data, failed API calls, duplicate records, and bad outputs.
6. Add a human approval checkpoint before any outbound message, billing change, or production update.
7. Provide a go-live plan with monitoring for the first three live runs.

# CONSTRAINTS & SAFETY RULES
- Do not invent credentials, private customer data, or unverifiable claims.
- Keep outbound communication respectful, short, and compliant with platform rules.
- Prefer test accounts and fake data until QA passes.
- Include rollback steps for every production action.

# OUTPUT FORMAT
Return the answer with these sections:
1. Workflow Summary
2. Tools and Accounts Needed
3. Step-by-Step Build Plan
4. Prompt or Message Templates
5. Test Data
6. QA Checklist
7. Go-Live Checklist
8. Risks and Mitigations
\`\`\``;
}

async function improveVideo(scriptPath) {
  const video = readJson(scriptPath);
  const meta = video.video || {};
  const videoId = meta.id;
  if (!videoId) return null;

  const basicPrompt = basicPromptForVideo(video);
  const outDir = path.join(OUTPUT_ROOT, videoId);
  const mdPath = path.join(outDir, 'improved_prompt_template.md');
  const sourcePath = path.join(outDir, 'source_prompt.txt');

  if (DRY_RUN) {
    console.log(`DRY RUN: would improve ${videoId}`);
    return { video_id: videoId, status: 'dry_run', method: 'none', output: mdPath };
  }

  const method = 'local_prompt_improver';
  const improved = localImprove(video);

  writeText(sourcePath, basicPrompt);
  writeText(mdPath, improved);
  console.log(`Improved material prompt for ${videoId}: ${method}`);
  return { video_id: videoId, status: 'improved', method, output: mdPath };
}

async function main() {
  const scriptFiles = fs.readdirSync(SCRIPTS_DIR)
    .filter(name => /^saas_\d+_data\.json$/i.test(name))
    .sort()
    .map(name => path.join(SCRIPTS_DIR, name));

  const results = [];
  for (const scriptPath of scriptFiles) {
    const result = await improveVideo(scriptPath);
    if (result) results.push(result);
  }

  const report = {
    checked_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    output_root: OUTPUT_ROOT,
    summary: {
      total: results.length,
      improved: results.filter(row => row.status === 'improved').length,
      local_prompt_improver: results.filter(row => row.method === 'local_prompt_improver').length,
      external_api_calls: 0
    },
    results
  };

  writeJson(path.join(REPORTS_DIR, 'material_prompt_improver_report.json'), report);
  writeJson(path.join(OUTPUT_ROOT, 'prompt_improver_index.json'), report);
  console.log(`Prompt improver report: ${path.join(REPORTS_DIR, 'material_prompt_improver_report.json')}`);
}

main().catch(err => {
  console.error(`Fatal material prompt improver error: ${err.message}`);
  process.exit(1);
});
