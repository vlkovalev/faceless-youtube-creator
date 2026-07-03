/**
 * saas_autopilot_comments_agent.js — B2B YouTube Comments Moderator & Replier Agent
 * =========================================================================
 * Scrapes recent comments, drafts replies using Claude (online) or a local
 * rule-engine (offline), flags complaints/suggestions, and posts replies.
 *
 * Mode 1: Review Mode (Default) — Prompts console user (Y/N/Edit/Skip) for approval.
 * Mode 2: Autopilot Mode (--auto) — Auto-approves and posts replies hands-free.
 *
 * Usage:
 *   node SaaS Autopilot/automation/saas_autopilot_comments_agent.js
 *   node SaaS Autopilot/automation/saas_autopilot_comments_agent.js --auto
 *   node SaaS Autopilot/automation/saas_autopilot_comments_agent.js --dry-run
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');
const readline = require('readline');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
const { openUrlHidden } = require('./open_url_hidden');
const { assertChannelNotOnHold } = require('./channel_hold_guard');

const AUTOMATION_DIR = __dirname;
const WORKSPACE_DIR  = path.join(AUTOMATION_DIR, '..');
const CREDENTIALS_DIR = path.join(AUTOMATION_DIR, 'credentials');
const METADATA_DIR   = path.join(WORKSPACE_DIR, 'metadata');

const SECRETS_FILE = path.join(CREDENTIALS_DIR, 'saas_autopilot_client_secrets.json');
const TOKENS_FILE  = path.join(CREDENTIALS_DIR, 'saas_autopilot_oauth_token.json');

const TRACKER_FILE = path.join(METADATA_DIR, 'comments_replied_tracker.json');
const FLAGGED_FILE = path.join(METADATA_DIR, 'flagged_feedback.json');
const ENV_PATH     = path.join(CREDENTIALS_DIR, '.env');

// Load environment variables
require('dotenv').config({ path: ENV_PATH });

const { callLLM } = require('../../automation/tools/llm_client');
const MODEL             = 'claude-3-5-sonnet-20241022';
const MAX_TOKENS        = 1000;

// ── CLI Args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const AUTO_MODE = args.auto || args.a || false;
const DRY_RUN   = args['dry-run'] || false;

assertChannelNotOnHold('comments agent');

// ── Helpers ───────────────────────────────────────────────────────────────────
function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, answer => {
    rl.close();
    resolve(answer.trim());
  }));
}

// ── OAuth Client Setup ────────────────────────────────────────────────────────
async function getOAuthClient() {
  if (!fs.existsSync(SECRETS_FILE)) {
    throw new Error(`B2B OAuth secrets missing. Save secrets to: ${SECRETS_FILE}`);
  }

  const secrets = readJson(SECRETS_FILE);
  const { client_id, client_secret, redirect_uris } = secrets.installed || secrets.web;
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube'
  ];

  if (fs.existsSync(TOKENS_FILE)) {
    const tokens = readJson(TOKENS_FILE);
    oauth2Client.setCredentials(tokens);
    try {
      const refreshed = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(refreshed.credentials);
      writeJson(TOKENS_FILE, refreshed.credentials);
    } catch (e) {
      console.warn('⚠️  Token refresh failed — re-authentication may be required.');
    }
    return oauth2Client;
  }

  // First-time auth flow specifically for the comments agent (automated browser redirect capture)
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes
  });
  console.log('\n🔐 SaaS Autopilot OAuth — Comments Agent Setup');
  console.log('   Opening your default browser to authorize the app...');
  console.log(`   If it doesn't open automatically, visit this URL:`);
  console.log(`\n   ${authUrl}\n`);
  
  // Open default browser without flashing a command window.
  openUrlHidden(authUrl);

  // Start temporary HTTP server on port 3000 to capture the code
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);
      if (parsedUrl.pathname === '/oauth2callback') {
        const authCode = parsedUrl.query.code;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 50px; background-color: #0d1117; color: #f0f6fc;">
              <h1 style="color: #3fb950;">✅ Authentication Successful!</h1>
              <p>You can close this browser tab now. The comments agent will continue running automatically in your console.</p>
            </body>
          </html>
        `);
        server.close();
        resolve(authCode);
      }
    });
    server.listen(3000);
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  writeJson(TOKENS_FILE, tokens);
  console.log('✅ B2B OAuth token saved with expanded scopes.\n');
  return oauth2Client;
}

// ── LLM Prompt Generator & Classifier ─────────────────────────────────────────
const SYSTEM_PROMPT = `You are the official "SaaS Autopilot" YouTube community manager AI. Your style is helpful, professional, highly technical, and concise.

Rules:
1. If the viewer asks for the code, template, or blueprint, politely tell them to check the description link or comment "BLUEPRINT" and we will send it.
2. If the viewer reports a bug or technical issue, express empathy and ask them to share their error logs or script context in detail.
3. If the viewer suggests a new workflow or feature, thank them and tell them we will review it for a future episode.
4. Keep all replies under 3 sentences. No fluff.

Your output must be returned as a strict JSON object matching this structure:
{
  "reply": "Drafted reply text here",
  "category": "question | praise | complaint | suggestion | other",
  "flagged": true/false,
  "reason": "Reason for flagging if complaint or suggestion, otherwise null"
}`;

// callClaude removed. callLLM from llm_client is used instead.

// ── Local Offline Fallback Reply Generator ─────────────────────────────────────
function generateOfflineReply(commentText) {
  const lower = commentText.toLowerCase();
  let reply = "Thanks for watching! Glad to have you in the SaaS Autopilot community. Let us know if you automate this workflow!";
  let category = "praise";
  let flagged = false;
  let reason = null;

  if (lower.includes("error") || lower.includes("fail") || lower.includes("broken") || lower.includes("bug") || lower.includes("stuck") || lower.includes("wrong") || lower.includes("crash") || lower.includes("not working")) {
    reply = "I'm sorry to hear you're running into issues. Could you share the specific terminal error logs or Node/FFmpeg version you're using? We'll help you get it resolved.";
    category = "complaint";
    flagged = true;
    reason = "User reported a bug or script execution error.";
  } else if (lower.includes("can you") || lower.includes("should") || lower.includes("suggest") || lower.includes("add") || lower.includes("feature") || lower.includes("request") || lower.includes("how about") || lower.includes("next episode")) {
    reply = "That's an excellent suggestion! We will review this workflow structure and consider featuring it in a future episode. Thanks for the feedback.";
    category = "suggestion";
    flagged = true;
    reason = "User requested a new feature or future video topic.";
  } else if (lower.includes("?") || lower.includes("how") || lower.includes("what") || lower.includes("where") || lower.includes("why")) {
    reply = "Good question! All project scripts, package configurations, and deployment guidelines are available in the boilerplate repository linked in the description.";
    category = "question";
  }

  return { reply, category, flagged, reason };
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=============================================================`);
  console.log(`  💬 SaaS Autopilot YouTube Comments Agent`);
  console.log(`  Mode        : ${AUTO_MODE ? 'AUTOPILOT (Auto-Reply)' : 'REVIEW (Interactive Approval)'}`);
  if (DRY_RUN) console.log(`  Dry Run     : ACTIVE (No actual replies will be posted)`);
  console.log(`=============================================================\n`);

  const oauth2Client = await getOAuthClient();
  const youtube = getYoutubeClient({ version: 'v3', auth: oauth2Client });

  // 1. Fetch authenticated channel ID
  console.log(`⏳ Fetching channel profile...`);
  const channelRes = await youtube.channels.list({ part: ['id', 'snippet'], mine: true });
  if (!channelRes.data.items || channelRes.data.items.length === 0) {
    throw new Error('Failed to find channel linked to active OAuth token.');
  }
  const channelId = channelRes.data.items[0].id;
  const channelTitle = channelRes.data.items[0].snippet.title;
  console.log(`✅ Connected to Channel: ${channelTitle} (${channelId})\n`);

  // Load trackers
  const tracker = readJson(TRACKER_FILE, { replied_comments: [] });
  const flaggedFeedback = readJson(FLAGGED_FILE, { reports: [] });

  // 2. Fetch recent comment threads
  console.log(`⏳ Fetching recent comment threads...`);
  const commentsRes = await youtube.commentThreads.list({
    part: ['snippet', 'replies'],
    allThreadsRelatedToChannelId: channelId,
    maxResults: 50
  });

  const threads = commentsRes.data.items || [];
  console.log(`📊 Scraped ${threads.length} comment threads.`);

  let processedCount = 0;

  for (const thread of threads) {
    const comment = thread.snippet.topLevelComment;
    const commentId = comment.id;
    const authorName = comment.snippet.authorDisplayName;
    const textOriginal = comment.snippet.textOriginal;

    // Check if we already replied to this comment thread
    const alreadyTracked = tracker.replied_comments.includes(commentId);
    let ownerReplied = false;
    if (thread.replies && thread.replies.comments) {
      ownerReplied = thread.replies.comments.some(r => r.snippet.authorChannelId.value === channelId);
    }

    if (alreadyTracked || ownerReplied) {
      if (ownerReplied && !alreadyTracked) {
        tracker.replied_comments.push(commentId); // Update tracker if replied manually
      }
      continue; // Skip already replied comments
    }

    processedCount++;
    console.log(`\n─[ Comment #${processedCount} ]─────────────────────────────────────────`);
    console.log(`👤 Author: ${authorName}`);
    console.log(`💬 Text  : "${textOriginal}"`);

    // 3. Draft reply & Classify
    let analysis;
    const hasKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (hasKey) {
      try {
        const raw = await callLLM(SYSTEM_PROMPT, `Viewer comment: "${textOriginal}"`);
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        analysis = JSON.parse(cleaned);
      } catch (err) {
        analysis = generateOfflineReply(textOriginal);
      }
    } else {
      analysis = generateOfflineReply(textOriginal);
    }

    // 4. Alert & Flag if Complaint/Suggestion
    if (analysis.flagged) {
      console.log(`\x1b[33m[FLAGGED - ${analysis.category.toUpperCase()}]\x1b[0m ${analysis.reason}`);
      flaggedFeedback.reports.push({
        comment_id: commentId,
        author: authorName,
        comment_text: textOriginal,
        category: analysis.category,
        reason: analysis.reason,
        timestamp: new Date().toISOString()
      });
      writeJson(FLAGGED_FILE, flaggedFeedback);
    } else {
      console.log(`🏷️  Category: ${analysis.category}`);
    }

    console.log(`✍️  Proposed Reply: "${analysis.reply}"`);

    // 5. Review Gate / Decision
    let approved = false;
    let finalReply = analysis.reply;

    if (AUTO_MODE) {
      approved = true;
      console.log(`🚀 Autopilot: Auto-approving reply.`);
    } else {
      const response = await askQuestion(`❓ Approve reply? (Y/N/Edit/Skip): `);
      const lower = response.toLowerCase();
      if (lower === 'y' || lower === 'yes' || response === '') {
        approved = true;
      } else if (lower === 'edit' || lower === 'e') {
        const customText = await askQuestion(`✏️  Enter custom reply: `);
        if (customText.trim() !== '') {
          finalReply = customText.trim();
          approved = true;
        }
      } else if (lower === 'n' || lower === 'no' || lower === 'skip' || lower === 's') {
        console.log(`⏭️  Skipped comment.`);
      }
    }

    // 6. Post Reply to YouTube
    if (approved) {
      if (DRY_RUN) {
        console.log(`[DRY RUN] Would post reply: "${finalReply}"`);
      } else {
        try {
          console.log(`📤 Posting reply to YouTube...`);
          await youtube.comments.insert({
            part: ['snippet'],
            requestBody: {
              snippet: {
                parentId: commentId,
                textOriginal: finalReply
              }
            }
          });
          console.log(`✅ Reply posted successfully!`);
        } catch (err) {
          console.error(`❌ Failed to post reply to YouTube:`, err.message);
          continue;
        }
      }

      tracker.replied_comments.push(commentId);
      writeJson(TRACKER_FILE, tracker);
    }
  }

  if (processedCount === 0) {
    console.log(`\n🎉 No new comments to process! Channel is completely up to date.`);
  } else {
    console.log(`\n✅ Finished checking comments. Tracker files updated.`);
  }
}

main().catch(err => {
  console.error('\nFatal Error:', err.message);
  process.exit(1);
});
