/**
 * prompt_improver_agent.js — Autonomous Prompt Improver & Optimizer
 * ===================================================================
 * Takes a basic prompt and uses Claude to automatically rewrite,
 * structure, and polish it into an advanced, professional-grade prompt template.
 *
 * Usage:
 *   node SaaS Autopilot/automation/prompt_improver_agent.js --prompt "Write a YouTube video description"
 *   node SaaS Autopilot/automation/prompt_improver_agent.js --prompt "Lead research scraper instructions" --dry-run
 *
 * Requires:
 *   ANTHROPIC_API_KEY env var in SaaS Autopilot/automation/credentials/.env
 *
 * Output:
 *   Refined prompt printed to console and saved as a downloadable Markdown file under SaaS Autopilot/prompts/
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// Load environment variables from the isolated credentials/.env
const ENV_PATH = path.join(__dirname, 'credentials', '.env');
require('dotenv').config({ path: ENV_PATH });

const WORKSPACE_DIR = path.join(__dirname, '..');
const PROMPTS_DIR   = path.join(WORKSPACE_DIR, 'prompts');

const { callLLM } = require('../../automation/tools/llm_client');
const MODEL             = 'claude-3-5-sonnet-20241022';
const MAX_TOKENS        = 4000;

// ── CLI Args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const BASIC_PROMPT = args.prompt || args.p || '';
const DRY_RUN      = args['dry-run'] || false;

// ── System Prompt (Prompt Improver Engine) ────────────────────────────────────
const IMPROVER_SYSTEM_PROMPT = `You are a world-class prompt engineer and prompt optimization agent. 
Your goal is to take a simple, basic prompt or task description from the user and expand, rewrite, and engineer it into an exceptionally powerful, professional-grade prompt template.

The improved prompt template you create must strictly follow best-practices in prompt design:
1. Define a clear ROLE & PERSONA for the AI (Who is the AI?).
2. Provide CONTEXT & OBJECTIVE (Why are we doing this and what is the target outcome?).
3. Outline explicit, step-by-step INSTRUCTIONS & WORKFLOW (How should the AI process the input?).
4. Impose strict CONSTRAINTS & LIMITATIONS (What must the AI avoid, e.g., buzzwords, formatting, rules).
5. Specify an exact OUTPUT FORMAT / TEMPLATE (How should the results look?).
6. Use clear variable brackets like {{variable_name}} to make the prompt reusable and downloadable as a template.

Format your output in clean, professional Markdown. 
Start your response with a brief 2-sentence explanation of what improvements were made, and then write the complete, ready-to-copy improved prompt template inside a standard markdown block.`;

// ── Anthropic API Caller ──────────────────────────────────────────────────────
// callClaude removed. callLLM from llm_client is used instead.

function sanitizeFilename(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50)
    .replace(/^_+|_+$/g, '');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!BASIC_PROMPT) {
    console.error('❌ Error: --prompt is required.');
    console.error('   Example: node SaaS Autopilot/automation/prompt_improver_agent.js --prompt "Write a cold outreach email"');
    process.exit(1);
  }

  const hasKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!hasKey && !DRY_RUN) {
    console.error('❌ Error: No LLM API keys set. Please set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY inside credentials/.env.');
    process.exit(1);
  }

  const filename = sanitizeFilename(BASIC_PROMPT) + '.md';
  const outputPath = path.join(PROMPTS_DIR, filename);

  console.log(`\n=============================================================`);
  console.log(`  🤖 SaaS Autopilot Prompt Improver Agent`);
  console.log(`  Basic Input : "${BASIC_PROMPT}"`);
  console.log(`  Output Path : SaaS Autopilot/prompts/${filename}`);
  if (DRY_RUN) console.log(`  Mode        : DRY RUN`);
  console.log(`=============================================================\n`);

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would call Claude to optimize the prompt and write it to:`);
    console.log(`   ${outputPath}`);
    return;
  }

  console.log(`⏳ Calling LLM API...`);
  try {
    const refinedPrompt = await callLLM(IMPROVER_SYSTEM_PROMPT, `Improve and optimize this basic prompt:\n"${BASIC_PROMPT}"`);

    if (!fs.existsSync(PROMPTS_DIR)) fs.mkdirSync(PROMPTS_DIR, { recursive: true });
    fs.writeFileSync(outputPath, refinedPrompt);

    console.log(`\n✅ Successfully generated and saved the optimized prompt!`);
    console.log(`💾 Saved to: ${outputPath}\n`);
    console.log(`=============================================================`);
    console.log(`🚀 IMPROVED PROMPT VIEW:\n`);
    console.log(refinedPrompt);
    console.log(`=============================================================`);

  } catch (err) {
    console.warn(`\n⚠️  API Access Error: ${err.message}`);
    console.log(`💡 Activating Local Offline Prompt Optimizer Fallback...`);
    
    const refinedPrompt = generateOfflinePrompt(BASIC_PROMPT);
    
    if (!fs.existsSync(PROMPTS_DIR)) fs.mkdirSync(PROMPTS_DIR, { recursive: true });
    fs.writeFileSync(outputPath, refinedPrompt);
    
    console.log(`\n✅ Successfully generated and saved the optimized prompt (Offline Fallback)!`);
    console.log(`💾 Saved to: ${outputPath}\n`);
    console.log(`=============================================================`);
    console.log(`🚀 IMPROVED PROMPT VIEW (OFFLINE FALLBACK):\n`);
    console.log(refinedPrompt);
    console.log(`=============================================================`);
  }
}

function generateOfflinePrompt(basicPrompt) {
  let role = "Specialized AI Assistant";
  let objective = `Execute the following task with elite professional execution: "${basicPrompt}"`;
  let constraints = "- Output must be clear, structured, and free of unnecessary fluff or preamble.\n- Adhere to professional standards of execution.\n- Ensure high quality, factual correctness, and extreme relevance.";
  let workflow = "1. Parse user variables and placeholders.\n2. Draft a high-quality response according to the defined objective.\n3. Refine for tone, clarity, and conciseness.";
  let format = "Return the output in clean, professionally-formatted Markdown.";

  const lower = basicPrompt.toLowerCase();

  if (lower.includes("email") || lower.includes("outreach") || lower.includes("copywriter")) {
    role = "Expert B2B Copywriter & Cold Outreach Strategist";
    objective = "Write a high-converting, personalized cold outreach email template targeting decision-makers.";
    constraints = "- Length: Under 150 words.\n- Tone: Conversational, confident, professional, and respectful.\n- Avoid: Buzzwords (e.g., 'synergy', 'revolutionary', 'game-changing') or standard cheesy sales pitches.\n- Personalization: Make it feel highly relevant to the recipient's role.";
    workflow = "1. Draft a hook that addresses a specific pain point of the recipient.\n2. Present a clear value proposition with a single key metric or case study.\n3. Make a low-friction Call to Action (CTA) asking for a quick 2-minute reply.";
    format = "### Cold Outreach Email Template\n\n**Subject:** [High-open rate subject line]\n\nDear {{recipient_name}},\n\n[Hook Addressing Pain Point]\n\n[Value Proposition & Metric/Result]\n\n[Low-Friction CTA]\n\nBest regards,\n\n{{sender_name}}\n{{sender_title}}";
  } else if (lower.includes("description") || lower.includes("youtube") || lower.includes("seo")) {
    role = "Elite YouTube Growth Specialist & SEO Copywriter";
    objective = "Write a high-engagement, SEO-optimized description for a B2B technology YouTube video.";
    constraints = "- Include target keywords naturally within the first 2 sentences.\n- Use engaging copy that encourages viewers to click the visual chapters and resources.";
    workflow = "1. Write a 2-sentence captivating summary designed for YouTube search algorithms.\n2. Outline the major chapters and timestamps.\n3. Include links to downloadable assets and call-to-actions.";
    format = "### YouTube Video Description Template\n\n{{video_hook_summary}}\n\n📌 **Key Timestamps:**\n0:00 - Introduction\n1:30 - {{chapter_1_title}}\n3:00 - {{chapter_2_title}}\n\n📥 **Download Free Resources:**\n- Boilerplate: {{boilerplate_link}}\n- Prompts Handbook: {{handbook_link}}";
  } else if (lower.includes("scrape") || lower.includes("lead") || lower.includes("research") || lower.includes("data")) {
    role = "Senior Data Engineer & Web Scraping Architect";
    objective = "Construct highly efficient, robust web scraping or data extraction instructions to compile B2B leads.";
    constraints = "- Ensure absolute data integrity and clean formatting.\n- Outline methods to bypass standard anti-scraping blocks safely.\n- Strictly adhere to targeted search fields (Company Name, Email, LinkedIn URL, Title).";
    workflow = "1. Identify the source directories and platforms.\n2. Set precise extraction filters to qualify B2B targets.\n3. Export data cleanly into JSON or CSV format.";
    format = "### Data Extraction Workflow\n\n**Target Data Schema:**\n- `company_name`: string\n- `contact_email`: string\n- `linkedin_url`: string\n- `decision_maker_title`: string\n\n**Instructions:**\n[Step-by-step selector and search patterns]";
  }

  return `### Offline Optimization Report
Due to API credit limits or network issues, this prompt was optimized offline using local Prompt Engineering Best Practices.

# ROLE & PERSONA
You are a ${role}. Your style is direct, output-focused, and highly professional.

# OBJECTIVE & CONTEXT
${objective}

# INSTRUCTIONS & WORKFLOW
${workflow}

# CONSTRAINTS & LIMITATIONS
${constraints}

# OUTPUT FORMAT
${format}`;
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
