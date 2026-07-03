/**
 * comment_moderation_agent.js
 *
 * Monitors YouTube comments for Corporate Shadows or The Saints, automatically drafts/posts
 * replies using Claude (Anthropic API), and flags complaints or suggestions for review.
 *
 * Usage:
 *   node automation/comment_moderation_agent.js --channel cs [--live]
 *   node automation/comment_moderation_agent.js --channel saints [--live]
 *   node automation/comment_moderation_agent.js --channel cs --dry-run
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, 'credentials', '.env') });

const fs = require('fs');
const path = require('path');
const https = require('https');
const { youtube: getYoutubeClient } = require('@googleapis/youtube');
const { OAuth2Client } = require('google-auth-library');
const {
  REPO_ROOT,
  SAINTS_CREDENTIALS_DIR,
  SAINTS_METADATA_DIR,
  SAAS_AUTOMATION_CREDENTIALS_DIR,
  SAAS_AUTOMATION_METADATA_DIR
} = require('./channel_paths');

const ROOT = REPO_ROOT;
const METADATA_DIR = path.join(ROOT, 'metadata');

const { callLLM } = require('./tools/llm_client');

// Parse arguments
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    acc[key] = (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[++i] : true;
  }
  return acc;
}, {});

const RAW_CHANNEL_PROFILE = (args.channel || 'cs').toLowerCase();
const CHANNEL_PROFILE = ['saas_autopilot', 'saasautopilot', 'saas_automation', 'saasautomation', 'saas', 'saas_autopilot', 'saas_autopilot'].includes(RAW_CHANNEL_PROFILE)
  ? 'saas_autopilot'
  : RAW_CHANNEL_PROFILE;
const IS_LIVE = args.live === true || args.live === 'true';
const DRY_RUN = !IS_LIVE;

const TOKENS_FILE =
  CHANNEL_PROFILE === 'saints' ? path.join(SAINTS_CREDENTIALS_DIR, 'saints_oauth_tokens.json') :
  CHANNEL_PROFILE === 'saas_autopilot' ? path.join(SAAS_AUTOMATION_CREDENTIALS_DIR, 'saas_autopilot_oauth_token.json') :
  path.join(__dirname, 'credentials', 'oauth_tokens.json');

const SECRETS_FILE =
  CHANNEL_PROFILE === 'saas_autopilot' ? path.join(SAAS_AUTOMATION_CREDENTIALS_DIR, 'saas_autopilot_client_secrets.json') :
  path.join(__dirname, 'credentials', 'client_secrets.json');

const STATUS_FILE =
  CHANNEL_PROFILE === 'saints' ? path.join(SAINTS_METADATA_DIR, 'youtube_channel_status_saints.json') :
  CHANNEL_PROFILE === 'saas_autopilot' ? path.join(SAAS_AUTOMATION_METADATA_DIR, 'youtube_channel_status_saas_autopilot.json') :
  path.join(METADATA_DIR, 'youtube_channel_status.json');

const CHANNEL_METADATA_DIR =
  CHANNEL_PROFILE === 'saints' ? SAINTS_METADATA_DIR :
  CHANNEL_PROFILE === 'saas_autopilot' ? SAAS_AUTOMATION_METADATA_DIR :
  METADATA_DIR;

const REPORT_JSON = path.join(CHANNEL_METADATA_DIR, 'comment_moderation_report.json');
const REPORT_MD = path.join(CHANNEL_METADATA_DIR, 'comment_moderation_report.md');

function readJsonFile(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
}

async function getYoutubeClientInstance() {
  if (!fs.existsSync(SECRETS_FILE) || !fs.existsSync(TOKENS_FILE)) {
    throw new Error(`Missing OAuth credentials. Make sure client_secrets.json and ${path.basename(TOKENS_FILE)} exist.`);
  }
  const secretsData = readJsonFile(SECRETS_FILE);
  const webOrInstalled = secretsData.installed || secretsData.web;
  const { client_id, client_secret, redirect_uris } = webOrInstalled;
  
  const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0] || 'http://localhost:3000');
  
  oauth2Client.on('tokens', (tokens) => {
    const existingTokens = readJsonFile(TOKENS_FILE);
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({ ...existingTokens, ...tokens }, null, 2));
  });
  
  oauth2Client.setCredentials(readJsonFile(TOKENS_FILE));
  return getYoutubeClient({ version: 'v3', auth: oauth2Client });
}

// callClaude removed. callLLM from llm_client is used instead.

const CLAUDE_SYSTEM_PROMPT = `You are a professional YouTube community manager.
Your task is to analyze a viewer comment and classify it.
You must output a single JSON object containing:
1. "category": String, one of "complaint", "suggestion", "question", or "appreciation".
2. "flagged": Boolean, true if it is a complaint/criticism or a suggestion for channel/video improvement.
3. "flagged_reason": String or null, explains why the comment is flagged.
4. "reply_draft": String, a contextually relevant, engaging reply.

Channel Tone Rules:
- For "Corporate Shadows": The channel covers dark business history, corporate scams, and monopolies. The tone is dark, investigative, slightly conspiratorial but safe and clinical. In replies, sound knowledgeable, appreciation-friendly, and maintain a clinical investigative interest.
- For "The Saints": The channel covers Orthodox/Catholic saints, monasticism, and miracles. The tone is warm, reverent, theological, and spiritually serious. In replies, sound warm, humble, and spiritually serious.
- For "SaaS Autopilot": The channel covers B2B software, automation workflows, AI systems, and tech blueprints. The tone is helpful, professional, highly technical, and concise. Keep replies under 3 sentences. If the viewer asks for code/templates, tell them to check description link or comment "BLUEPRINT" to get it. If they report a bug, express empathy and ask for details/error logs. If they suggest a feature, thank them and say we will review it for a future episode.

Output ONLY valid JSON. No markdown code blocks, no explanations outside the JSON structure.`;

function buildClaudeUserPrompt(commentText, channelName) {
  return `Analyze this comment left on our channel "${channelName}":
Comment: "${commentText}"

Generate the JSON classification and draft response. Make sure the reply is concise, sounds human, and matches the channel's niche and style.`;
}

async function run() {
  console.log(`\n💬 Comment Moderation & Response Agent`);
  console.log(`   Channel profile: ${CHANNEL_PROFILE.toUpperCase()}`);
  console.log(`   Mode           : ${DRY_RUN ? 'DRY-RUN (Simulated)' : 'LIVE (Posting Replies)'}\n`);

  const statusData = readJsonFile(STATUS_FILE);
  const channelId = statusData.channel ? statusData.channel.id : null;
  const channelName = statusData.channel ? statusData.channel.title : (
    CHANNEL_PROFILE === 'saints' ? 'The Saints' :
    CHANNEL_PROFILE === 'saas_autopilot' ? 'SaaS Autopilot' :
    'Corporate Shadows'
  );
  
  if (!channelId) {
    console.warn(`[WARNING] Channel status file not synced or missing channel.id. Running mine:true fallback...`);
  }

  const youtube = await getYoutubeClientInstance();
  
  console.log('⏳ Fetching recent comments...');
  let threads = [];
  try {
    const response = await youtube.commentThreads.list({
      part: ['snippet', 'replies'],
      ...(channelId ? { allThreadsRelatedToChannelId: channelId } : { mine: true }),
      maxResults: 50
    });
    threads = response.data.items || [];
  } catch (err) {
    console.error(`❌ Failed to fetch comments: ${err.message}`);
    process.exit(1);
  }

  console.log(`Fetched ${threads.length} comment threads.`);
  
  const processed = [];
  const flagged = [];

  for (const thread of threads) {
    const topComment = thread.snippet.topLevelComment.snippet;
    const commentId = thread.snippet.topLevelComment.id;
    const authorName = topComment.authorDisplayName;
    const commentText = topComment.textDisplay || topComment.textOriginal;
    const videoId = thread.snippet.videoId;
    const publishedAt = topComment.publishedAt;

    // Check if we already replied to this thread
    let alreadyReplied = false;
    if (thread.replies && thread.replies.comments) {
      alreadyReplied = thread.replies.comments.some(reply => {
        const replyAuthorId = reply.snippet.authorChannelId ? reply.snippet.authorChannelId.value : null;
        return replyAuthorId === channelId;
      });
    }

    if (alreadyReplied) {
      console.log(`   [SKIPPED] Already replied to comment from @${authorName}`);
      continue;
    }

    console.log(`\nAnalyzing comment from @${authorName}: "${commentText.slice(0, 80)}..."`);

    let analysis = {
      category: 'appreciation',
      flagged: false,
      flagged_reason: null,
      reply_draft: CHANNEL_PROFILE === 'saas_autopilot'
        ? 'Thank you for watching! Glad to have you in the SaaS Autopilot community. Let us know if you automate this workflow!'
        : 'Thank you for watching and supporting the channel!'
    };

    const hasKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (hasKey) {
      try {
        const rawLLM = await callLLM(CLAUDE_SYSTEM_PROMPT, buildClaudeUserPrompt(commentText, channelName));
        const cleaned = rawLLM.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        analysis = JSON.parse(cleaned);
      } catch (err) {
        console.error(`   [WARNING] LLM call failed: ${err.message}. Using default fallback.`);
        const lower = commentText.toLowerCase();
        if (CHANNEL_PROFILE === 'saas_autopilot') {
          if (lower.includes("error") || lower.includes("fail") || lower.includes("broken") || lower.includes("bug") || lower.includes("stuck") || lower.includes("wrong") || lower.includes("crash") || lower.includes("not working")) {
            analysis = {
              category: 'complaint',
              flagged: true,
              flagged_reason: 'User reported a bug or script execution error.',
              reply_draft: "I'm sorry to hear you're running into issues. Could you share the specific terminal error logs or Node/FFmpeg version you're using? We'll help you get it resolved."
            };
          } else if (lower.includes("can you") || lower.includes("should") || lower.includes("suggest") || lower.includes("add") || lower.includes("feature") || lower.includes("request") || lower.includes("how about") || lower.includes("next episode")) {
            analysis = {
              category: 'suggestion',
              flagged: true,
              flagged_reason: 'User requested a new feature or future video topic.',
              reply_draft: "That's an excellent suggestion! We will review this workflow structure and consider featuring it in a future episode. Thanks for the feedback."
            };
          } else if (lower.includes("?") || lower.includes("how") || lower.includes("what") || lower.includes("where") || lower.includes("why")) {
            analysis = {
              category: 'question',
              flagged: false,
              flagged_reason: null,
              reply_draft: "Good question! All project scripts, package configurations, and deployment guidelines are available in the boilerplate repository linked in the description."
            };
          }
        } else {
          // Basic heuristic fallback for cs / saints
          if (lower.includes('wrong') || lower.includes('fake') || lower.includes('robotic')) {
            analysis = {
              category: 'complaint',
              flagged: true,
              flagged_reason: 'Viewer flagged accuracy/voice quality concern.',
              reply_draft: 'Thank you for your feedback. We are actively refining our script checking and voice engine to make the videos as clean and premium as possible.'
            };
          }
        }
      }
    }

    console.log(`   Category: ${analysis.category.toUpperCase()} | Flagged: ${analysis.flagged}`);
    console.log(`   Draft   : "${analysis.reply_draft}"`);

    let replyStatus = 'simulated_reply';
    if (!DRY_RUN && analysis.reply_draft) {
      try {
        await youtube.comments.insert({
          part: ['snippet'],
          requestBody: {
            snippet: {
              parentId: commentId,
              textOriginal: analysis.reply_draft
            }
          }
        });
        replyStatus = 'replied';
        console.log(`   [SUCCESS] Posted reply on YouTube!`);
      } catch (err) {
        replyStatus = 'failed_to_reply';
        console.error(`   [ERROR] Failed to post reply: ${err.message}`);
      }
    }

    const record = {
      comment_id: commentId,
      video_id: videoId,
      author: authorName,
      comment: commentText,
      published_at: publishedAt,
      category: analysis.category,
      flagged: analysis.flagged,
      flagged_reason: analysis.flagged_reason,
      reply_draft: analysis.reply_draft,
      status: replyStatus
    };

    processed.push(record);
    if (analysis.flagged) {
      flagged.push(record);
    }
  }

  // Save report
  const report = {
    generated_at: new Date().toISOString(),
    channel_name: channelName,
    channel_id: channelId,
    mode: DRY_RUN ? 'dry-run' : 'live',
    summary: {
      comments_processed: processed.length,
      complaints_and_suggestions_flagged: flagged.length
    },
    processed,
    flagged
  };

  fs.mkdirSync(METADATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));

  // Build markdown report
  const md = [
    `# 💬 YouTube Comment Moderation & Reply Report`,
    `*Generated: ${report.generated_at}*`,
    `*Channel: ${report.channel_name} (${report.channel_id || 'mine'})*`,
    `*Mode: ${report.mode.toUpperCase()}*`,
    '',
    `## 📊 Summary`,
    `- **Total New Comments Processed**: ${report.summary.comments_processed}`,
    `- **Complaints & Suggestions Flagged**: ${report.summary.complaints_and_suggestions_flagged}`,
    '',
    `## 🚨 Flagged Actionable Comments (Review Required)`,
    report.flagged.length === 0 ? '_No flagged complaints or suggestions found in this run._' : '',
    ...report.flagged.map(f => [
      `### 👤 @${f.author} (Category: ${f.category})`,
      `- **Comment**: "${f.comment}"`,
      `- **Reason Flagged**: ${f.flagged_reason}`,
      `- **Drafted Reply**: *"${f.reply_draft}"*`,
      `- **Publish Status**: ${f.status === 'replied' ? '✅ Live Reply Posted' : '⏳ Dry-run (Simulated)'}`,
      `- **Video Link**: [Watch Video](https://youtube.com/watch?v=${f.video_id})`,
      ''
    ].join('\n')),
    '',
    `## 📄 All Processed Comments`,
    processed.length === 0 ? '_No new comment threads checked._' : '',
    ...processed.filter(p => !p.flagged).map(p => [
      `- **@${p.author}** (${p.category}): "${p.comment.slice(0, 100)}..."`,
      `  - *Reply Draft*: "${p.reply_draft}" [${p.status}]`,
    ].join('\n')),
    '',
    `---`,
    `*Run \`node automation/comment_moderation_agent.js --channel ${CHANNEL_PROFILE} --live\` to post replies live.*`
  ].join('\n');

  fs.writeFileSync(REPORT_MD, md);
  console.log(`\n==========================================`);
  console.log(`[SUCCESS] JSON Report saved to: metadata/comment_moderation_report.json`);
  console.log(`[SUCCESS] Markdown Report saved to: metadata/comment_moderation_report.md`);
  console.log(`==========================================\n`);
  
  if (flagged.length > 0) {
    console.log(`🚨 Action Required: ${flagged.length} actionable complaints/suggestions have been flagged!`);
  }
}

run().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
