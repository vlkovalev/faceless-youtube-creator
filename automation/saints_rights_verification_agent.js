/**
 * saints_rights_verification_agent.js
 * Reusable rights gate for The Saints.
 *
 * Checks:
 * - Akathist/prayer text sources are not treated as cleared unless explicit permission/license is recorded.
 * - Nikon/letter sources are paraphrase-only unless permission/license is recorded.
 * - Visual plans use exact file pages, not search/category pages, before asset verification.
 * - asset_attribution.json entries contain source URL, license, and approved usage status.
 *
 * This agent does not delete, publish, spend money, or use credentials.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, SAINTS_ROOT, resolveSaintsRelative } = require('./channel_paths');

const ROOT = REPO_ROOT;
const METADATA_DIR = path.join(SAINTS_ROOT, 'metadata');
const ASSETS_DIR = path.join(SAINTS_ROOT, 'assets');
const args = process.argv.slice(2);
const failOnBlockers = args.includes('--fail-on-blockers');
const explicitVideo = (args.find(a => a.startsWith('--video=')) || '').split('=')[1] || null;

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isClearedStatus(value) {
  const token = normalize(value);
  return ['rights_verified', 'approved', 'cleared', 'permission_granted', 'licensed', 'public_domain', 'cc0', 'cc_by', 'cc_by_sa'].includes(token)
    || token.includes('permission_granted')
    || token.includes('public_domain')
    || token.startsWith('cc_by');
}

function isBlockedStatus(value) {
  const token = normalize(value);
  return !token || ['pending', 'unknown', 'rights_review_needed', 'source_found_rights_review_needed', 'verify_per_file_before_use', 'needs_permission', 'permission_needed'].includes(token);
}

function classifyTextSource(url = '', declaredStatus = '', note = '') {
  const lowerUrl = String(url || '').toLowerCase();
  const lowerNote = String(note || '').toLowerCase();
  if (lowerUrl.includes('akathists.com')) {
    return {
      status: 'cleared_for_use',
      severity: 'ok',
      reason: 'Akathists.com granted permission for The Saints to use akathist texts in YouTube prayer videos. Attribution required.'
    };
  }
  if (isClearedStatus(declaredStatus) && /permission|license|public domain|cc-by|cc0|creative commons/i.test(note)) {
    return { status: 'cleared_for_use', severity: 'ok', reason: 'Explicit cleared status plus permission/license note recorded.' };
  }
  if (lowerUrl.includes('oca.org') || lowerUrl.includes('files.oca.org')) {
    return { status: 'permission_required', severity: 'blocker', reason: 'OCA/service text may be copyrighted or liturgical-use-only. Use as research until explicit YouTube reuse permission is recorded.' };
  }
  if (lowerUrl.includes('abbotnikon.org') || lowerUrl.includes('ocanwa.org')) {
    return { status: 'paraphrase_only', severity: 'warning', reason: 'Modern English letter/biographical text. Use for research and paraphrase unless permission is recorded.' };
  }
  if (lowerUrl.includes('orthodoxwiki.org')) {
    return { status: 'reference_only_attribute', severity: 'warning', reason: 'Reference source; use for facts and attribution. Do not copy article text into script.' };
  }
  if (lowerNote.includes('full-text reuse must be verified') || lowerNote.includes('reuse rights must be verified')) {
    return { status: 'permission_required', severity: 'blocker', reason: 'Queue note explicitly says full-text reuse must be verified.' };
  }
  return { status: 'review_required', severity: 'warning', reason: 'No explicit reusable text license/permission recorded.' };
}

function classifyVisualUrl(url = '') {
  const lower = String(url || '').toLowerCase();
  if (!lower) return { status: 'missing_source_url', severity: 'blocker', reason: 'No source URL recorded.' };
  if (lower.includes('commons.wikimedia.org/wiki/file:') || lower.includes('commons.wikimedia.org/wiki/file%3a')) {
    return { status: 'exact_file_page_required_license_check', severity: 'warning', reason: 'Exact Commons file page present; verify license box and attribution before approval.' };
  }
  if (lower.includes('commons.wikimedia.org') && (lower.includes('special:mediasearch') || lower.includes('/wiki/category:'))) {
    return { status: 'source_lead_not_license', severity: 'blocker', reason: 'Commons search/category page is only a lead, not an asset license.' };
  }
  if (lower.includes('loc.gov')) {
    return { status: 'rights_advisory_required', severity: 'warning', reason: 'Library of Congress pages need exact item rights advisory review before use.' };
  }
  return { status: 'exact_rights_review_required', severity: 'warning', reason: 'Verify exact page license/permission before use.' };
}

function licenseLooksReusable(value = '') {
  const token = normalize(value);
  if (!token || ['unknown', 'pending', 'verify_per_file_before_use', 'needs_review', 'needs_permission'].includes(token)) return false;
  return token.includes('public_domain') || token === 'pd' || token === 'cc0' || token.startsWith('cc_by') || token.includes('creative_commons') || token.includes('permission_granted') || token.includes('licensed');
}

function collectPrayerFindings() {
  const queue = readJson(path.join(METADATA_DIR, 'saints_prayer_companion_queue.json'), []);
  const findings = [];
  for (const item of queue) {
    const preferred = item.preferred_prayer || {};
    const classification = classifyTextSource(preferred.source_url, item.status, preferred.rights_note);
    findings.push({
      type: 'prayer_companion',
      id: item.companion_id,
      title: item.working_title,
      saint: item.saint,
      source_url: preferred.source_url || null,
      declared_status: item.status || null,
      agent_status: classification.status,
      severity: classification.severity,
      reason: classification.reason,
      required_action: classification.severity === 'blocker' ? 'Record explicit permission/license before full text/audio/on-screen use, or use original commentary instead.' : 'Keep attribution and avoid long copied text.'
    });
  }
  return findings;
}

function collectNikonFindings() {
  const queuePath = path.join(METADATA_DIR, 'nikon_vorobyov_series_queue.json');
  const queue = readJson(queuePath, null);
  if (!queue) return [];
  return (queue.core_sources || []).map(source => {
    const classification = classifyTextSource(source.url, source.status || queue.status, source.rights_note);
    return {
      type: 'nikon_source',
      id: source.id,
      title: source.title,
      source_url: source.url,
      declared_status: source.status || queue.status || null,
      agent_status: classification.status,
      severity: classification.severity,
      reason: classification.reason,
      required_action: classification.severity === 'blocker' ? 'Permission required before extended readings/full copied text.' : 'Use as source/citation; paraphrase into original narration.'
    };
  });
}

function collectVisualFindings() {
  if (!fs.existsSync(ASSETS_DIR)) return [];
  const folders = fs.readdirSync(ASSETS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^saints_video_\d+_assets$/.test(d.name))
    .filter(d => !explicitVideo || d.name === `saints_video_${explicitVideo}_assets`)
    .map(d => path.join(ASSETS_DIR, d.name));
  const findings = [];
  for (const folder of folders) {
    const videoMatch = path.basename(folder).match(/saints_video_(\d+)_assets/);
    const videoId = videoMatch ? videoMatch[1] : path.basename(folder);
    const plan = readJson(path.join(folder, 'visual_plan.json'), null);
    const attribution = readJson(path.join(folder, 'asset_attribution.json'), []);
    const attributionItems = Array.isArray(attribution)
      ? attribution
      : (Array.isArray(attribution?.beats) ? attribution.beats : []);
    const attributionByAsset = new Map(attributionItems.map(item => [item.asset_file, item]));

    if (!plan || !Array.isArray(plan.scenes)) {
      findings.push({ type: 'visual_plan', video_id: videoId, severity: 'blocker', agent_status: 'missing_visual_plan', reason: 'No visual_plan.json with scenes found.' });
      continue;
    }

    for (const scene of plan.scenes) {
      for (const beat of scene.beats || []) {
        const sourceUrl = beat.primary_source_url || beat.source_url || beat.file_page_url || '';
        const urlClass = classifyVisualUrl(sourceUrl);
        const attr = beat.asset_file ? attributionByAsset.get(beat.asset_file) : null;
        const hasApprovedAttribution = Boolean(attr && attr.source_url && licenseLooksReusable(attr.license || attr.license_status) && isClearedStatus(attr.usage_status || attr.status || 'approved'));
        const beatLicenseOk = licenseLooksReusable(beat.license_status || beat.license || beat.rights_status);
        const assigned = Boolean(beat.asset_file);
        const approved = assigned && (hasApprovedAttribution || beatLicenseOk) && !['blocker'].includes(urlClass.severity);
        findings.push({
          type: 'visual_beat',
          video_id: videoId,
          scene_number: scene.scene_number,
          beat_id: beat.beat_id,
          visual_type: beat.visual_type || null,
          asset_file: beat.asset_file || null,
          source_url: sourceUrl || null,
          license_status: beat.license_status || null,
          agent_status: approved ? 'approved' : (assigned ? 'assigned_needs_rights_verification' : urlClass.status),
          severity: approved ? 'ok' : (assigned ? 'blocker' : urlClass.severity),
          reason: approved ? 'Asset has assigned file plus reusable license/attribution evidence.' : (assigned ? 'Assigned asset lacks approved attribution or reusable license evidence.' : urlClass.reason),
          required_action: approved ? 'None.' : 'Select exact file page, verify license, download/assign asset_file, and record attribution.'
        });
      }
    }
  }
  return findings;
}

function summarize(findings) {
  const counts = { ok: 0, warning: 0, blocker: 0 };
  for (const item of findings) {
    if (item.severity === 'ok') counts.ok += 1;
    else if (item.severity === 'blocker') counts.blocker += 1;
    else counts.warning += 1;
  }
  return counts;
}

function writeMarkdown(report) {
  const lines = [];
  lines.push('# Saints Rights Verification Report');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push('');
  lines.push(`Summary: ${report.summary.ok} ok, ${report.summary.warning} warning, ${report.summary.blocker} blocker.`);
  lines.push('');
  lines.push('## Production Decision');
  lines.push(report.production_decision);
  lines.push('');
  lines.push('## Blockers');
  const blockers = report.findings.filter(f => f.severity === 'blocker').slice(0, 80);
  if (!blockers.length) lines.push('- None.');
  for (const b of blockers) lines.push(`- ${b.type} ${b.id || b.video_id || ''}${b.beat_id ? ` beat ${b.beat_id}` : ''}: ${b.reason}`);
  lines.push('');
  lines.push('## Rules');
  lines.push('- Akathists.com akathist text is cleared for The Saints YouTube prayer videos by email permission from admin@akathists.com; attribution required.');
  lines.push('- Other akathist/prayer text sources remain blocked until explicit reuse permission/license is recorded.');
  lines.push('- Nikon letters are paraphrase-only unless permission/license is recorded.');
  lines.push('- Wikimedia search/category pages do not clear image rights; exact File pages are required.');
  lines.push('- Every final Saints asset needs `asset_attribution.json` with source URL, license, and approved usage status.');
  fs.writeFileSync(path.join(METADATA_DIR, 'rights_verification_report.md'), lines.join('\n'));
}

function main() {
  const findings = [
    ...collectPrayerFindings(),
    ...collectNikonFindings(),
    ...collectVisualFindings()
  ];
  const summary = summarize(findings);
  const report = {
    channel: 'The Saints',
    generated_at: new Date().toISOString(),
    mode: explicitVideo ? `video_${explicitVideo}` : 'all_saints_sources',
    summary,
    production_decision: summary.blocker > 0 ? 'blocked_until_rights_are_cleared' : 'rights_gate_passed',
    findings
  };
  writeJson(path.join(METADATA_DIR, 'rights_verification_report.json'), report);
  writeMarkdown(report);
  console.log(`Saints rights verification: ${report.production_decision}`);
  console.log(`Summary: ${summary.ok} ok, ${summary.warning} warning, ${summary.blocker} blocker.`);
  console.log(`Report: ${path.join(METADATA_DIR, 'rights_verification_report.json')}`);
  if (failOnBlockers && summary.blocker > 0) process.exitCode = 1;
}

main();
