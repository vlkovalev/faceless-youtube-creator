/**
 * visual_asset_planner.js
 *
 * Converts a Corporate Shadows script into a scene-by-scene visual plan
 * with 3-5 timed beats per scene, source recommendations, and search queries.
 *
 * Output: assets/video_N_assets/visual_plan.json
 *
 * Usage:
 *   node visual_asset_planner.js --video 1
 *   node visual_asset_planner.js --video 1,2,3
 *   node visual_asset_planner.js --all
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const ASSETS_DIR = path.join(ROOT, 'assets');

// Documentary pacing: ~130 wpm = 2.2 words/second
const WORDS_PER_SECOND = 2.2;

// ---------------------------------------------------------------------------
// Script loader
// ---------------------------------------------------------------------------

function loadScript(videoId) {
    const filePath = path.join(SCRIPTS_DIR, 'video_' + videoId + '_data.js');
    if (!fs.existsSync(filePath)) {
        throw new Error('Script not found: ' + filePath);
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const m = raw.match(/window\.SCRIPTS\[\d+\]\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (!m) throw new Error('Cannot parse script format for video ' + videoId);
    try {
        return JSON.parse(m[1]);
    } catch (e) {
        throw new Error('JSON parse failed for video ' + videoId + ': ' + e.message);
    }
}

// ---------------------------------------------------------------------------
// Duration estimation
// ---------------------------------------------------------------------------

function estimateDuration(voiceover) {
    const clean = voiceover.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const words = clean.split(' ').length;
    const pauses = (voiceover.match(/<span class="pause">/g) || []).length;
    return Math.round((words / WORDS_PER_SECOND) + (pauses * 1.5));
}

// ---------------------------------------------------------------------------
// Beat splitter
// ---------------------------------------------------------------------------

function splitIntoBeats(voiceover, target) {
    const clean = voiceover.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    if (sentences.length <= target) {
        return sentences.map(function(s) { return s.trim(); }).filter(Boolean);
    }
    var beats = [];
    var size = Math.ceil(sentences.length / target);
    for (var i = 0; i < sentences.length; i += size) {
        var chunk = sentences.slice(i, i + size).join(' ').trim();
        if (chunk) beats.push(chunk);
    }
    return beats.slice(0, target);
}

// ---------------------------------------------------------------------------
// Source recommender
// ---------------------------------------------------------------------------

var SRC = {
    WIKIMEDIA: 'wikimedia_commons',
    LOC:       'library_of_congress',
    ARCHIVE:   'internet_archive',
    GENERATED: 'generated_graphic',
    STOCK:     'stock_broll',
};

var SOURCE_MAP = [
    { re: /\b(1[0-9]{3}|18[0-9]{2}|19[0-9]{2}|20[0-9]{2}s?)\b/,              src: SRC.WIKIMEDIA, note: 'historical period photo' },
    { re: /\b(map|globe|country|nation|africa|india|america|europe|russia)\b/i, src: SRC.WIKIMEDIA, note: 'map or geographic illustration' },
    { re: /\b(CEO|executive|president|founder|chairman|heir|scientist)\b/i,     src: SRC.WIKIMEDIA, note: 'executive or scientist portrait' },
    { re: /\b(logo|brand|company|corporation|product)\b/i,                      src: SRC.WIKIMEDIA, note: 'company or brand visual' },
    { re: /\b(newspaper|headline|report|scandal|lawsuit|trial|congress)\b/i,    src: SRC.LOC,       note: 'newspaper or document scan' },
    { re: /\b(advertisement|ad|campaign|poster|magazine|slogan)\b/i,            src: SRC.LOC,       note: 'vintage advertisement' },
    { re: /\b(documentary|newsreel|footage|film|archive)\b/i,                   src: SRC.ARCHIVE,   note: 'archival film or newsreel' },
    { re: /\b(chart|graph|statistic|percent|billion|million|market)\b/i,        src: SRC.GENERATED, note: 'animated stat or chart graphic' },
    { re: /\b(timeline|founded|years|decade|century|history)\b/i,               src: SRC.GENERATED, note: 'timeline graphic' },
    { re: /\b(factory|warehouse|office|boardroom|vault|mine|industrial)\b/i,    src: SRC.STOCK,     note: 'industrial or corporate b-roll' },
];

function recommendSource(beatText, sceneTitle, visualPrompt) {
    var combined = beatText + ' ' + sceneTitle + ' ' + (visualPrompt || '');
    for (var i = 0; i < SOURCE_MAP.length; i++) {
        if (SOURCE_MAP[i].re.test(combined)) {
            return { type: SOURCE_MAP[i].src, note: SOURCE_MAP[i].note };
        }
    }
    return { type: SRC.GENERATED, note: 'cinematic title card or mood graphic' };
}

// ---------------------------------------------------------------------------
// Search query builder
// ---------------------------------------------------------------------------

var STOP = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'was','were','is','are','had','has','have','they','their','them','this',
    'that','these','those','not','from','into','out','up','about','which',
    'when','where','who','how','what','would','could','should','did','do',
    'be','been','being','by','as','its','it','if','so','yet','only','just'
]);

function buildQuery(beatText, srcType) {
    var words = beatText.toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(function(w) { return w.length > 3 && !STOP.has(w); });
    var seen = new Set();
    var unique = words.filter(function(w) {
        if (seen.has(w)) return false;
        seen.add(w);
        return true;
    });
    var core = unique.slice(0, 5).join(' ');
    switch (srcType) {
        case SRC.WIKIMEDIA: return core + ' site:commons.wikimedia.org';
        case SRC.LOC:       return core + ' site:loc.gov';
        case SRC.ARCHIVE:   return core + ' site:archive.org';
        case SRC.GENERATED: return '[GENERATE] ' + core + ' — dark corporate documentary style';
        case SRC.STOCK:     return core + ' stock footage Storyblocks';
        default:            return core;
    }
}

function buildUrl(query, srcType) {
    var term = encodeURIComponent(
        query.replace(/\s*site:[^\s]+/g, '').replace(/\[GENERATE\]\s*/g, '').trim()
    );
    switch (srcType) {
        case SRC.WIKIMEDIA: return 'https://commons.wikimedia.org/w/index.php?search=' + term + '&title=Special:MediaSearch&type=image';
        case SRC.LOC:       return 'https://www.loc.gov/search/?q=' + term;
        case SRC.ARCHIVE:   return 'https://archive.org/search?query=' + term + '&mediatype=movies';
        case SRC.STOCK:     return 'https://www.storyblocks.com/video/search?term=' + term;
        default:            return null;
    }
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

function assignTimings(beats, sceneDuration, sceneStart) {
    var wordCounts = beats.map(function(b) { return b.split(/\s+/).length; });
    var total = wordCounts.reduce(function(a, b) { return a + b; }, 0);
    var cursor = sceneStart;
    return beats.map(function(b, i) {
        var dur = Math.max(3, Math.round(sceneDuration * (wordCounts[i] / total)));
        var result = { start: cursor, dur: dur };
        cursor += dur;
        return result;
    });
}

// ---------------------------------------------------------------------------
// Plan builder
// ---------------------------------------------------------------------------

function buildPlan(videoId, data) {
    var runTime = 0;
    var planScenes = [];

    data.scenes.forEach(function(scene) {
        var dur = estimateDuration(scene.voiceover);
        var targetBeats = dur <= 20 ? 2 : dur <= 35 ? 3 : dur <= 50 ? 4 : 5;
        var beatTexts = splitIntoBeats(scene.voiceover, targetBeats);
        var timings = assignTimings(beatTexts, dur, runTime);

        var beats = beatTexts.map(function(text, i) {
            var rec = recommendSource(text, scene.title, scene.visual_prompt);
            var query = buildQuery(text, rec.type);
            var cleanQuery = query.replace(/\s*site:[^\s]+/, '').replace(/\[GENERATE\]\s*/, '').trim();
            var url = buildUrl(query, rec.type);
            return {
                beat_id: scene.scene_number + String.fromCharCode(97 + i),
                start_s: timings[i].start,
                duration_s: timings[i].dur,
                narration_excerpt: text.slice(0, 120) + (text.length > 120 ? '...' : ''),
                asset_type: rec.type,
                asset_note: rec.note,
                search_query: cleanQuery,
                source_url: url,
                asset_file: null,
                status: 'pending',
                fallback: 'scene_' + scene.scene_number + '_image.png',
            };
        });

        planScenes.push({
            scene_number: scene.scene_number,
            title: scene.title,
            start_s: runTime,
            duration_s: dur,
            beat_count: beats.length,
            primary_asset_file: 'scene_' + scene.scene_number + '_image.png',
            visual_prompt: scene.visual_prompt || '',
            beats: beats,
        });

        runTime += dur;
    });

    return {
        video_id: videoId,
        title: data.video.title,
        niche: data.video.niche,
        generated_at: new Date().toISOString(),
        estimated_total_duration_s: runTime,
        script_duration_ok: runTime >= 480,
        total_beats: planScenes.reduce(function(s, sc) { return s + sc.beat_count; }, 0),
        source_priority: [
            '1. wikimedia_commons — free, public domain, best for historical',
            '2. library_of_congress — vintage ads, newspapers, portraits',
            '3. internet_archive — newsreels, documentary footage',
            '4. generated_graphic — charts, timelines, evidence boards',
            '5. stock_broll — Storyblocks for industrial/corporate b-roll',
        ],
        scenes: planScenes,
    };
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

function writePlan(videoId, plan) {
    var dir = path.join(ASSETS_DIR, 'video_' + videoId + '_assets');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    var out = path.join(dir, 'visual_plan.json');
    fs.writeFileSync(out, JSON.stringify(plan, null, 2));
    return out;
}

// ---------------------------------------------------------------------------
// Summary printer
// ---------------------------------------------------------------------------

function pad(s, n) { return String(s).padEnd(n); }

function printSummary(videoId, plan) {
    var m = Math.floor(plan.estimated_total_duration_s / 60);
    var s = plan.estimated_total_duration_s % 60;
    var durationOk = plan.script_duration_ok ? 'OK' : 'WARNING: UNDER 480s — NEEDS EXPANSION';
    console.log('\n' + '='.repeat(60));
    console.log('VIDEO ' + videoId + ': ' + plan.title);
    console.log('Duration: ' + m + 'm ' + s + 's  [' + durationOk + ']');
    console.log('Total beats: ' + plan.total_beats + ' across ' + plan.scenes.length + ' scenes');

    var counts = {};
    plan.scenes.forEach(function(sc) {
        sc.beats.forEach(function(b) {
            counts[b.asset_type] = (counts[b.asset_type] || 0) + 1;
        });
    });
    console.log('\nSource breakdown:');
    Object.keys(counts).forEach(function(t) {
        var pct = Math.round((counts[t] / plan.total_beats) * 100);
        console.log('  ' + pad(t, 28) + counts[t] + ' beats (' + pct + '%)');
    });

    console.log('\nFirst 3 beats:');
    var shown = 0;
    for (var si = 0; si < plan.scenes.length && shown < 3; si++) {
        var sc = plan.scenes[si];
        for (var bi = 0; bi < sc.beats.length && shown < 3; bi++) {
            var b = sc.beats[bi];
            console.log('  [' + b.beat_id + '] ' + b.start_s + 's–' + (b.start_s + b.duration_s) + 's  ' + b.asset_type);
            console.log('       ' + b.asset_note);
            console.log('       Search: "' + b.search_query + '"');
            if (b.source_url) console.log('       ' + b.source_url);
            shown++;
        }
    }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
    var args = process.argv.slice(2);
    if (args.includes('--all')) return [1, 2, 3, 4, 5];
    var idx = args.findIndex(function(a) { return a === '--video'; });
    if (idx !== -1 && args[idx + 1]) {
        return args[idx + 1].split(',').map(Number);
    }
    var inline = args.find(function(a) { return a.startsWith('--video='); });
    if (inline) return inline.replace('--video=', '').split(',').map(Number);
    return [1];
}

function main() {
    var ids = parseArgs();
    console.log('\nVisual Asset Planner — Corporate Shadows');
    console.log('Videos: ' + ids.join(', '));

    ids.forEach(function(id) {
        try {
            console.log('\nLoading video ' + id + '...');
            var data = loadScript(id);
            var plan = buildPlan(id, data);
            var out = writePlan(id, plan);
            printSummary(id, plan);
            console.log('\n+ Plan written: ' + out);
        } catch (e) {
            console.error('x Video ' + id + ' failed: ' + e.message);
        }
    });

    console.log('\n' + '='.repeat(60));
    console.log('Next steps:');
    console.log('  1. Open assets/video_N_assets/visual_plan.json');
    console.log('  2. For each beat, open source_url and download best match');
    console.log('  3. Save as: assets/video_N_assets/beat_1a.jpg (or .mp4)');
    console.log('  4. Set status to "downloaded" and fill asset_file field');
    console.log('  5. Expand any scripts flagged WARNING to meet 480s minimum');
    console.log('');
}

main();
