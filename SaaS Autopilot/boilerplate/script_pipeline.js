/**
 * Standalone YouTube Script Generation Pipeline (Boilerplate Blueprint)
 * ===================================================================
 * A complete, clean-code Node.js blueprint showing how to programmatically
 * call the Anthropic Claude API to generate structured video scripts.
 * 
 * Part of the "AI Operator" YouTube Channel resources.
 * Feel free to clone, edit, and adapt this for your own workflows!
 */

'use strict';

const fs = require('fs');
const https = require('https');

// ── Configuration ────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'YOUR_API_KEY_HERE';
const MODEL             = 'claude-3-5-sonnet-20241022';
const MAX_TOKENS        = 4000;

// ── System Prompt (The Copywriting Brain) ─────────────────────────────────────
const SYSTEM_PROMPT = `You are a professional B2B SaaS automation and AI engineering scriptwriter.
Your goal is to write a highly engaging, structured, proof-based YouTube video script.

Follow this pacing and scene structure:
1. Scene 1: The Hook (0:00–0:30) — Lead with the massive end-result in the very first sentence.
2. Scene 2: The Problem (0:30–1:30) — Detail the manual pain and calculate the time/click costs.
3. Scene 3: The Stack (1:30–2:30) — List every tool, price, and version clearly.
4. Scene 4: The Build (2:30–6:00) — Walk through the architecture step-by-step.
5. Scene 5: The Results (6:00–7:00) — Compare manual vs. automated time/costs (e.g., 3 hours vs 4 minutes).
6. Scene 6: The CTA (7:00–end) — Direct interest-based call to action to grab the open source code, followed by the required support line: "This channel needs your support. Please subscribe, leave a word of appreciation for the author, and may God bless you."

Output strictly valid JSON with no markdown formatting or code blocks:
{
  "title": "...",
  "scenes": [
    {
      "scene_number": 1,
      "title": "...",
      "voiceover": "..."
    }
  ]
}`;

// ── API Request Caller ────────────────────────────────────────────────────────
function callClaude(topicTitle, hookBrief) {
  return new Promise((resolve, reject) => {
    if (ANTHROPIC_API_KEY === 'YOUR_API_KEY_HERE') {
      return reject(new Error('Please configure your ANTHROPIC_API_KEY at the top of the script.'));
    }

    const body = JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ 
        role: 'user', 
        content: `Generate a script for: "${topicTitle}" with hook: "${hookBrief}"` 
      }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(`API Error: ${parsed.error.message}`));
          resolve(parsed.content[0].text);
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${e.message}\nRaw: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Runner ────────────────────────────────────────────────────────────────────
async function run() {
  const topicTitle = 'Automating Lead Research Scrapers in 30 Minutes';
  const hookBrief  = 'I gave Claude a company name and it returned a personalized outbound research brief in 3 minutes.';

  console.log(`\n🤖 Starting Autonomous Script Pipeline Blueprint...`);
  console.log(`   Topic: "${topicTitle}"\n`);

  console.log('⏳ Calling Claude 3.5 Sonnet API...');
  try {
    const rawResult = await callClaude(topicTitle, hookBrief);
    
    // Clean any accidental code blocks
    const cleanedJson = rawResult
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim();

    const scriptJson = JSON.parse(cleanedJson);
    const outputPath = 'generated_script.json';

    fs.writeFileSync(outputPath, JSON.stringify(scriptJson, null, 2));

    console.log(`\n✅ Script successfully written to: ${outputPath}!`);
    console.log(`🎬 Title: ${scriptJson.title}`);
    console.log(`📦 Scenes: ${scriptJson.scenes.length} generated.`);
    
  } catch (err) {
    console.error(`❌ Execution failed:`, err.message);
  }
}

run();
