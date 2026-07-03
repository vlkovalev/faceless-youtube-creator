/**
 * broll_shortlist_generator.js
 *
 * Produces a manual download checklist of REAL stock b-roll footage for a
 * Corporate Shadows episode, per the canonical visual formula's act
 * structure (docs/visual_formula_template.json). For every act, for every
 * required b-roll phrase, prints ready-to-click search links on the three
 * free sources the formula calls for: Pexels, Pixabay, Mixkit.
 *
 * This does not download anything — it's the shortlist for manual sourcing.
 * Output: assets/video_N_assets/broll_shortlist.md
 *
 * Usage:
 *   node broll_shortlist_generator.js --video 1
 *   node broll_shortlist_generator.js --video 1,2,3
 *   node broll_shortlist_generator.js --all
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { loadFormulaActs } = require('./formula_acts');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const ASSETS_DIR = path.join(ROOT, 'assets');
const WORDS_PER_SECOND = 2.2;

function loadScript(videoId) {
    const filePath = path.join(SCRIPTS_DIR, 'video_' + videoId + '_data.js');
    if (!fs.existsSync(filePath)) throw new Error('Script not found: ' + filePath);
    const raw = fs.readFileSync(filePath, 'utf8');
    const m = raw.match(/window\.SCRIPTS\[\d+\]\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (!m) throw new Error('Cannot parse script format for video ' + videoId);
    return JSON.parse(m[1]);
}

function estimateDuration(voiceover) {
    const clean = voiceover.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const words = clean.split(' ').length;
    const pauses = (voiceover.match(/<span class="pause">/g) || []).length;
    return Math.round((words / WORDS_PER_SECOND) + (pauses * 1.5));
}

function fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
}

function searchLinks(phrase) {
    const term = encodeURIComponent(phrase);
    return {
        pexels: 'https://www.pexels.com/search/videos/' + term + '/',
        pixabay: 'https://pixabay.com/videos/search/' + term + '/',
        mixkit: 'https://mixkit.co/free-stock-video/?q=' + term,
    };
}

function buildShortlist(videoId, data) {
    const totalDuration = data.scenes.reduce((s, sc) => s + estimateDuration(sc.voiceover), 0);
    const acts = loadFormulaActs();

    const lines = [];
    lines.push('# B-Roll Shortlist — Video ' + videoId + ': ' + data.video.title);
    lines.push('');
    lines.push('Manual sourcing checklist. Check the box once a real clip is downloaded and');
    lines.push('saved to `assets/video_' + videoId + '_assets/`. All three sources are free,');
    lines.push('no-attribution-required for commercial use — no API key needed, just click and download.');
    lines.push('');

    acts.forEach(act => {
        const startS = Math.round(act.startFrac * totalDuration);
        const endS = Math.round(act.endFrac * totalDuration);
        lines.push('## ' + act.name + ' (' + fmtTime(startS) + '–' + fmtTime(endS) + ')');
        lines.push('');
        act.bRoll.forEach(phrase => {
            const links = searchLinks(phrase);
            lines.push('- [ ] **' + phrase + '**');
            lines.push('  - Pexels: ' + links.pexels);
            lines.push('  - Pixabay: ' + links.pixabay);
            lines.push('  - Mixkit: ' + links.mixkit);
        });
        lines.push('');
    });

    lines.push('## Notes');
    lines.push('- Prefer Pexels/Pixabay first — largest libraries, consistent quality.');
    lines.push('- Mixkit has no search API, so its link opens a site search; browse results manually.');
    lines.push('- Save downloaded clips as `broll_<act>_<n>.mp4` inside the video\'s assets folder, then');
    lines.push('  update `editor_agent.js`/`editor_beat_agent.js` scene mapping to use the real clip');
    lines.push('  instead of the zoompan-on-still fallback for that act\'s scenes.');

    return lines.join('\n') + '\n';
}

function writeShortlist(videoId, content) {
    const dir = path.join(ASSETS_DIR, 'video_' + videoId + '_assets');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, 'broll_shortlist.md');
    fs.writeFileSync(out, content);
    return out;
}

function parseArgs() {
    const args = process.argv.slice(2);
    if (args.includes('--all')) return [1, 2, 3, 4, 5];
    const idx = args.findIndex(a => a === '--video');
    if (idx !== -1 && args[idx + 1]) return args[idx + 1].split(',').map(Number);
    const inline = args.find(a => a.startsWith('--video='));
    if (inline) return inline.replace('--video=', '').split(',').map(Number);
    return [1];
}

function main() {
    const ids = parseArgs();
    console.log('\nB-Roll Shortlist Generator — Corporate Shadows');
    console.log('Videos: ' + ids.join(', '));

    ids.forEach(id => {
        try {
            const data = loadScript(id);
            const content = buildShortlist(id, data);
            const out = writeShortlist(id, content);
            console.log('+ Shortlist written: ' + out);
        } catch (e) {
            console.error('x Video ' + id + ' failed: ' + e.message);
        }
    });
}

main();
