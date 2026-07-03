/**
 * saints_prayer_companion_agent.js
 *
 * Gates prayer-companion episodes that follow Saints documentaries.
 * It never clones voices, never renders full prayer text before rights review,
 * and never uploads anything. It prepares a production report and next action.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { SAINTS_ROOT } = require('./channel_paths');

const ROOT = SAINTS_ROOT;
const args = process.argv.slice(2);
const explicitVideo = (args.find(arg => arg.startsWith('--video=')) || '').split('=')[1];
const companionIdArg = (args.find(arg => arg.startsWith('--companion=')) || '').split('=')[1];

function readJson(rel, fallback) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(rel, data) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadPrayerScript(videoId) {
  const file = path.join(ROOT, 'scripts', `saints_video_${videoId}_prayer_data.js`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const match = raw.match(new RegExp(`window\\.SAINTS_PRAYER_COMPANIONS\\[${videoId}\\]\\s*=\\s*(\\{[\\s\\S]+\\})\\s*;?\\s*$`));
  if (!match) throw new Error(`Could not parse prayer companion script for Saints ${videoId}`);
  return JSON.parse(match[1]);
}

function statusFor(item, script) {
  const rightsVerified = item.status === 'rights_verified'
    || item.preferred_prayer?.rights_verified === true
    || script?.rights_verified === true;
  const voicePermissioned = item.voice_plan?.permissioned_recording === true
    || script?.voice_policy?.permissioned_recording === true
    || item.voice_plan?.allowed_fallback;
  const hasScript = Boolean(script);
  const blockers = [];

  if (!hasScript) blockers.push('Missing prayer companion script file.');
  if (!rightsVerified) blockers.push('Full Akathist text rights are not verified.');
  if (!voicePermissioned) blockers.push('No permissioned recording or original fallback voice selected.');

  return {
    companion_id: item.companion_id,
    after_video_id: item.after_video_id,
    saint: item.saint,
    working_title: item.working_title,
    status: blockers.length ? 'blocked_rights_or_voice_review' : 'ready_for_prayer_render',
    blockers,
    next_action: blockers.length
      ? 'Verify prayer text reuse rights and choose either a permissioned real reader recording or original non-impersonating voice.'
      : 'Generate prayer audio, readable text cards, icon visual, QC, then create a private draft.',
    source_url: item.preferred_prayer?.source_url || null,
    backup_source_url: item.preferred_prayer?.backup_source_url || null,
    life_circumstances_helped: item.life_circumstances_helped || script?.pastoral_context?.helps_with || []
  };
}

function main() {
  const queue = readJson('metadata/saints_prayer_companion_queue.json', []);
  const filtered = queue.filter(item => {
    if (explicitVideo && String(item.after_video_id) !== String(explicitVideo)) return false;
    if (companionIdArg && item.companion_id !== companionIdArg) return false;
    return true;
  });
  if (!filtered.length) throw new Error('No matching prayer companion entry found.');

  const companions = filtered.map(item => {
    const script = loadPrayerScript(item.after_video_id);
    return statusFor(item, script);
  });

  const report = {
    generated_at: new Date().toISOString(),
    mode: 'prayer_companion_rights_gate',
    safety: {
      unauthorized_voice_cloning: false,
      render_full_unverified_text: false,
      upload: false
    },
    companions
  };

  writeJson('metadata/saints_prayer_companion_report.json', report);
  console.log(`# Saints Prayer Companion Report\n`);
  for (const companion of companions) {
    console.log(`- ${companion.companion_id}: ${companion.status}`);
    if (companion.blockers.length) console.log(`  Blockers: ${companion.blockers.join('; ')}`);
    console.log(`  Next: ${companion.next_action}`);
  }
}

if (require.main === module) main();
module.exports = { main, statusFor };
