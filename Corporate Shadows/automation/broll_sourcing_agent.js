/**
 * broll_sourcing_agent.js
 *
 * Automatically sources REAL stock b-roll footage for a Corporate Shadows
 * episode and wires it into the render pipeline — no manual browsing.
 *
 * For each act of the canonical visual formula (docs/visual_formula_template.json),
 * searches Pexels (primary) and Pixabay (fallback) for each required b-roll
 * phrase, downloads the best-matching clip, and installs it as that act's
 * scenes' scene_N_video.mp4 — replacing the zoompan-on-still placeholder.
 * The original placeholder is kept as a .zoompan_backup.mp4 so nothing is lost.
 *
 * Requires PEXELS_API_KEY and/or PIXABAY_API_KEY in automation/credentials/.env
 * (both are free, instant signup — see that file for links). Without a key,
 * this agent reports what it would have searched for and makes no changes.
 *
 * Usage:
 *   node broll_sourcing_agent.js --video 1
 *   node broll_sourcing_agent.js --video 1,2,3
 *   node broll_sourcing_agent.js --all
 */

'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, 'credentials', '.env') });

const { loadFormulaActs, actForFraction } = require('./formula_acts');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const ASSETS_DIR = path.join(ROOT, 'assets');
const WORDS_PER_SECOND = 2.2;

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY || '';

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

async function searchPexels(query, page) {
    if (!PEXELS_API_KEY) return null;
    try {
        const res = await axios.get('https://api.pexels.com/videos/search', {
            headers: { Authorization: PEXELS_API_KEY },
            params: { query, per_page: 5, page: page || 1, orientation: 'landscape' },
            timeout: 15000,
        });
        const videos = res.data.videos || [];
        const candidate = videos.find(v => v.duration >= 3 && v.duration <= 60);
        if (!candidate) return null;
        const files = candidate.video_files
            .filter(f => f.file_type === 'video/mp4' && f.width && f.width <= 1920)
            .sort((a, b) => b.width - a.width);
        const file = files[0] || candidate.video_files[0];
        return file ? { url: file.link, source: 'pexels' } : null;
    } catch (e) {
        console.warn(`  Pexels search failed for "${query}": ${e.message}`);
        return null;
    }
}

async function searchPixabay(query, page) {
    if (!PIXABAY_API_KEY) return null;
    try {
        const res = await axios.get('https://pixabay.com/api/videos/', {
            params: { key: PIXABAY_API_KEY, q: query, per_page: 5, page: page || 1 },
            timeout: 15000,
        });
        const hits = res.data.hits || [];
        const candidate = hits.find(h => h.duration >= 3 && h.duration <= 60);
        if (!candidate) return null;
        const variant = candidate.videos.medium || candidate.videos.large || candidate.videos.small;
        return variant ? { url: variant.url, source: 'pixabay' } : null;
    } catch (e) {
        console.warn(`  Pixabay search failed for "${query}": ${e.message}`);
        return null;
    }
}

async function findClip(query, page) {
    return (await searchPexels(query, page)) || (await searchPixabay(query, page));
}

async function downloadClip(url, outPath) {
    const res = await axios.get(url, { responseType: 'stream', timeout: 60000 });
    const contentType = res.headers['content-type'] || '';
    if (!contentType.startsWith('video')) throw new Error('Unexpected content-type: ' + contentType);
    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outPath);
        res.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

function markShortlistDownloaded(assetsDir, phrase) {
    const shortlistPath = path.join(assetsDir, 'broll_shortlist.md');
    if (!fs.existsSync(shortlistPath)) return;
    const content = fs.readFileSync(shortlistPath, 'utf8');
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const updated = content.replace(new RegExp(`- \\[ \\] \\*\\*${escaped}\\*\\*`), `- [x] **${phrase}**`);
    if (updated !== content) fs.writeFileSync(shortlistPath, updated);
}

async function sourceVideo(videoId) {
    const assetsDir = path.join(ASSETS_DIR, 'video_' + videoId + '_assets');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    const data = loadScript(videoId);
    const acts = loadFormulaActs();
    const durations = data.scenes.map(sc => estimateDuration(sc.voiceover));
    const totalDuration = durations.reduce((a, b) => a + b, 0);

    let runTime = 0;
    const scenesByAct = {};
    data.scenes.forEach((scene, idx) => {
        const act = actForFraction(acts, totalDuration > 0 ? runTime / totalDuration : 0);
        (scenesByAct[act.key] = scenesByAct[act.key] || { act, scenes: [] }).scenes.push(scene);
        runTime += durations[idx];
    });

    let sourced = 0;
    let skipped = 0;

    for (const actKey of Object.keys(scenesByAct)) {
        const { act, scenes } = scenesByAct[actKey];
        const pageByPhrase = {};
        const clipPool = [];

        for (let i = 0; i < scenes.length; i++) {
            const phrase = act.bRoll[i % act.bRoll.length];
            pageByPhrase[phrase] = (pageByPhrase[phrase] || 0) + 1;
            console.log(`[Video ${videoId}] ${act.name} — searching: "${phrase}"`);
            const found = await findClip(phrase, pageByPhrase[phrase]);
            if (!found) {
                console.warn(`  No result for "${phrase}" (Pexels/Pixabay key missing or no match).`);
                clipPool.push(null);
                continue;
            }
            const outPath = path.join(assetsDir, `broll_${act.key}_${i + 1}.mp4`);
            try {
                await downloadClip(found.url, outPath);
                console.log(`  Downloaded (${found.source}): ${path.basename(outPath)}`);
                markShortlistDownloaded(assetsDir, phrase);
                clipPool.push(outPath);
            } catch (e) {
                console.warn(`  Download failed for "${phrase}": ${e.message}`);
                clipPool.push(null);
            }
        }

        scenes.forEach((scene, i) => {
            const clipPath = clipPool[i];
            if (!clipPath) { skipped++; return; }
            const sceneVideoPath = path.join(assetsDir, `scene_${scene.scene_number}_video.mp4`);
            const backupPath = path.join(assetsDir, `scene_${scene.scene_number}_video.zoompan_backup.mp4`);
            if (fs.existsSync(sceneVideoPath) && !fs.existsSync(backupPath)) {
                fs.copyFileSync(sceneVideoPath, backupPath);
            }
            fs.copyFileSync(clipPath, sceneVideoPath);
            sourced++;
        });
    }

    console.log(`\n[Video ${videoId}] Real b-roll installed for ${sourced} scene(s), ${skipped} scene(s) kept the zoompan fallback.`);
    return { sourced, skipped };
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

async function main() {
    if (!PEXELS_API_KEY && !PIXABAY_API_KEY) {
        console.error('No PEXELS_API_KEY or PIXABAY_API_KEY set in automation/credentials/.env.');
        console.error('Both are free — add at least one key, then re-run this agent.');
        process.exit(1);
    }

    const ids = parseArgs();
    console.log('\nB-Roll Sourcing Agent — Corporate Shadows');
    console.log('Videos: ' + ids.join(', '));
    console.log('Sources: ' + [PEXELS_API_KEY && 'Pexels', PIXABAY_API_KEY && 'Pixabay'].filter(Boolean).join(', ') + '\n');

    for (const id of ids) {
        try {
            await sourceVideo(id);
        } catch (e) {
            console.error(`x Video ${id} failed: ${e.message}`);
        }
    }
}

main();
