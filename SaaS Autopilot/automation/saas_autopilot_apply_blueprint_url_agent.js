/**
 * SaaS Autopilot Apply Blueprint URL Agent
 * ========================================
 * Applies a real public downloadable blueprint URL to all existing SaaS
 * Autopilot script metadata files. Future generated scripts should use the
 * SAAS_AUTOPILOT_BLUEPRINT_URL environment variable.
 *
 * Usage:
 *   node automation/saas_autopilot_apply_blueprint_url_agent.js --url "https://example.com/download.zip"
 */

'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '..');
const SCRIPTS_DIR = path.join(WORKSPACE_DIR, 'scripts', 'saas_autopilot');

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = val;
  }
  return acc;
}, {});

const DOWNLOAD_URL = args.url || args.u;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function validateUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (err) {
    throw new Error(`Invalid URL: ${value}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Download URL must start with http:// or https://: ${value}`);
  }
}

function buildDescription(existingDescription, url) {
  const text = String(existingDescription || '');
  const intro = text.split(/\n\n(?:📥|ðŸ“¥|\uD83D\uDCE5|\uD83D\uDD17|🔗|\uD83D\uDCCE|📌|ðŸ“Œ)/)[0].trim();
  const hashtagsMatch = text.match(/(?:\n\n)?(#AIAutomation[\s\S]*)$/);
  const hashtags = hashtagsMatch ? hashtagsMatch[1].trim() : '#AIAutomation #B2B #ClaudeAI #SaaS #Productivity';

  return `${intro}\n\n📥 **Download the Blueprint Pack:**\n${url}\n\nIncludes outreach templates and Make.com blueprint JSON files.\n\n📌 **Key Timestamps:**\n0:00 — Hook\n0:30 — The Problem\n1:30 — The Stack\n2:30 — The Build\n6:00 — Results\n7:00 — Get the Code\n\n${hashtags}`;
}

function main() {
  if (!DOWNLOAD_URL) {
    console.error('Error: --url is required.');
    process.exit(1);
  }
  validateUrl(DOWNLOAD_URL);

  const files = fs.readdirSync(SCRIPTS_DIR)
    .filter(name => /^saas_\d+_data\.json$/i.test(name))
    .sort();

  let changed = 0;
  for (const file of files) {
    const filePath = path.join(SCRIPTS_DIR, file);
    const data = readJson(filePath);
    if (!data.metadata) data.metadata = {};
    const current = data.metadata.description_template || '';
    const next = buildDescription(current, DOWNLOAD_URL);
    if (next !== current) {
      data.metadata.description_template = next;
      writeJson(filePath, data);
      changed += 1;
      console.log(`UPDATED ${file}`);
    } else {
      console.log(`UNCHANGED ${file}`);
    }
  }

  console.log(`Applied blueprint URL to ${changed}/${files.length} metadata file(s).`);
  console.log('For future generated scripts, set SAAS_AUTOPILOT_BLUEPRINT_URL to this same URL.');
}

main();
