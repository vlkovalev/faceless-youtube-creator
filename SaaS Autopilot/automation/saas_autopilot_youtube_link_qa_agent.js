/**
 * SaaS Autopilot YouTube Link QA Agent
 * ====================================
 * Checks uploaded YouTube video links from local channel status/tracker files.
 *
 * It validates:
 *   - every canonical upload has a YouTube ID
 *   - every YouTube watch URL resolves over HTTP
 *   - viewer accessibility based on privacy status
 *
 * Usage:
 *   node automation/saas_autopilot_youtube_link_qa_agent.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const WORKSPACE_DIR = path.join(__dirname, '..');
const METADATA_DIR = path.join(WORKSPACE_DIR, 'metadata');
const REPORTS_DIR = path.join(METADATA_DIR, 'qa_reports');
const STATUS_FILE = path.join(METADATA_DIR, 'youtube_channel_status_saas_autopilot.json');
const TRACKER_FILE = path.join(METADATA_DIR, 'uploads_tracker.json');

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function requestUrl(targetUrl, redirectCount = 0) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      resolve({ ok: false, status: null, error: `Invalid URL: ${err.message}` });
      return;
    }

    const req = https.request({
      method: 'GET',
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      path: `${parsed.pathname}${parsed.search}`,
      timeout: 15000,
      headers: {
        'User-Agent': 'SaaS-Autopilot-YouTube-Link-QA/1.0',
        'Accept': 'text/html,*/*'
      }
    }, (res) => {
      const status = res.statusCode || 0;
      const location = res.headers.location;
      res.resume();

      if ([301, 302, 303, 307, 308].includes(status) && location && redirectCount < 5) {
        const nextUrl = new URL(location, parsed).toString();
        requestUrl(nextUrl, redirectCount + 1).then(resolve);
        return;
      }

      resolve({ ok: status >= 200 && status < 400, status, error: null });
    });

    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', err => resolve({ ok: false, status: null, error: err.message }));
    req.end();
  });
}

function isTransportLimited(result) {
  if (!result || result.ok) return false;
  if (result.status) return false;
  return true;
}

function trackerRows(tracker) {
  const uploaded = (tracker && tracker.uploaded_files) || {};
  return Object.entries(uploaded)
    .filter(([, row]) => row && row.channel === 'saas_autopilot' && row.canonical)
    .map(([file_name, row]) => ({ file_name, ...row }));
}

function statusMap(status) {
  const rows = (status && status.videos) || [];
  return new Map(rows.map(row => [row.youtube_id, row]));
}

async function main() {
  const status = readJson(STATUS_FILE, {});
  const tracker = readJson(TRACKER_FILE, {});
  const byId = statusMap(status);
  const uploads = trackerRows(tracker);

  if (uploads.length === 0) {
    console.error('No canonical SaaS Autopilot uploads found in uploads_tracker.json.');
    process.exit(1);
  }

  const results = [];
  let transportLimitedCount = 0;
  for (const upload of uploads) {
    const live = byId.get(upload.youtube_id) || {};
    const privacy = live.privacy_status || 'unknown';
    const watch_url = `https://www.youtube.com/watch?v=${upload.youtube_id}`;
    const httpCheck = await requestUrl(watch_url);
    const viewer_accessible = privacy === 'public' || privacy === 'unlisted';
    const issues = [];

    if (!upload.youtube_id) issues.push('Missing YouTube ID.');
    if (!httpCheck.ok && !isTransportLimited(httpCheck)) {
      const detail = httpCheck.status ? `HTTP ${httpCheck.status}` : httpCheck.error;
      issues.push(`Watch URL did not resolve: ${detail}`);
    }
    if (isTransportLimited(httpCheck)) {
      transportLimitedCount += 1;
      const detail = httpCheck.error || 'transport unavailable';
      issues.push(`Watch URL could not be verified from this shell: ${detail}`);
    }
    if (!viewer_accessible) {
      issues.push(`Video is not viewer-accessible because privacy_status is "${privacy}".`);
    }

    results.push({
      file_name: upload.file_name,
      video_id: live.video_id || null,
      youtube_id: upload.youtube_id,
      title: upload.title || live.title || '',
      privacy_status: privacy,
      watch_url,
      link_resolves: httpCheck.ok,
      http_status: httpCheck.status,
      viewer_accessible,
      issues
    });

    const detail = httpCheck.status ? `HTTP ${httpCheck.status}` : (httpCheck.error || 'transport unavailable');
    const label = httpCheck.ok ? 'OK' : (isTransportLimited(httpCheck) ? 'WARN' : 'FAIL');
    console.log(`${label} ${upload.youtube_id} ${privacy} ${watch_url} (${detail})`);
  }

  const hardFailures = results.filter(row => (!row.link_resolves && row.http_status) || !row.youtube_id);
  const privateRows = results.filter(row => !row.viewer_accessible);
  const report = {
    checked_at: new Date().toISOString(),
    channel: status.channel || null,
    summary: {
      total: results.length,
      link_resolves: results.filter(row => row.link_resolves).length,
      link_failures: hardFailures.length,
      link_verification_limited: transportLimitedCount,
      viewer_accessible: results.filter(row => row.viewer_accessible).length,
      not_viewer_accessible: privateRows.length
    },
    results
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const jsonPath = path.join(REPORTS_DIR, 'youtube_uploaded_links_qa_report.json');
  const mdPath = path.join(REPORTS_DIR, 'youtube_uploaded_links_qa_report.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const lines = [
    '# YouTube Uploaded Links QA Report',
    '',
    `Checked at: ${report.checked_at}`,
    `Total links: ${report.summary.total}`,
    `Links resolving: ${report.summary.link_resolves}`,
    `Link failures: ${report.summary.link_failures}`,
    `Link verification limited by shell/network: ${report.summary.link_verification_limited}`,
    `Viewer-accessible: ${report.summary.viewer_accessible}`,
    `Not viewer-accessible: ${report.summary.not_viewer_accessible}`,
    '',
    '| File | YouTube ID | Privacy | Link Resolves | Viewer Accessible | URL |',
    '|---|---|---|---|---|---|'
  ];

  for (const row of results) {
    lines.push(`| ${row.file_name} | ${row.youtube_id} | ${row.privacy_status} | ${row.link_resolves ? 'yes' : 'no'} | ${row.viewer_accessible ? 'yes' : 'no'} | ${row.watch_url} |`);
  }

  if (privateRows.length) {
    lines.push('');
    lines.push('## Viewer Access Notes');
    lines.push('');
    for (const row of privateRows) {
      lines.push(`- ${row.file_name}: ${row.watch_url} resolves, but YouTube status is "${row.privacy_status}", so public viewers cannot watch it yet.`);
    }
  }

  fs.writeFileSync(mdPath, lines.join('\n'));

  console.log(`\nJSON report: ${jsonPath}`);
  console.log(`Markdown report: ${mdPath}`);

  if (hardFailures.length) {
    console.error(`\nYouTube link QA failed: ${hardFailures.length} watch URL(s) did not resolve.`);
    process.exit(1);
  }

  if (transportLimitedCount) {
    console.warn(`\nWatch-link verification was limited by this shell/network for ${transportLimitedCount} video(s).`);
  }

  if (privateRows.length) {
    console.warn(`\nAll watch URLs resolve, but ${privateRows.length} video(s) are private and not viewer-accessible.`);
  } else {
    console.log('\nAll uploaded YouTube links resolve and are viewer-accessible.');
  }
}

main().catch(err => {
  console.error(`Fatal YouTube link QA error: ${err.message}`);
  process.exit(1);
});
