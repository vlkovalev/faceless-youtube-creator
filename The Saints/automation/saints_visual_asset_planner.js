/**
 * saints_visual_asset_planner.js
 *
 * Builds a scene-by-scene visual sourcing plan for The Saints videos.
 * The planner prefers real icons, paintings, monastery photographs,
 * manuscript/book imagery, and saint portraits before generated cards.
 *
 * Output: assets/saints_video_N_assets/visual_plan.json
 *
 * Usage:
 *   node automation/saints_visual_asset_planner.js --video 13
 *   node automation/saints_visual_asset_planner.js --video 13,14
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const ASSETS_DIR = path.join(ROOT, 'assets');
const SOURCE_LIBRARY_PATH = path.join(ROOT, 'metadata', 'saints_visual_source_library.json');

const WORDS_PER_SECOND = 2.05;

const VISUAL_TYPES = {
    ICON: 'icon_or_painting',
    MONASTERY: 'monastery_or_location',
    MANUSCRIPT: 'manuscript_book_or_letter',
    PORTRAIT: 'portrait_or_historical_person',
    GENERATED: 'generated_atmospheric_card',
    MAP: 'map_or_route',
};

const STOP_WORDS = new Set([
    'the', 'and', 'that', 'with', 'from', 'this', 'they', 'were', 'was',
    'his', 'her', 'for', 'not', 'but', 'had', 'have', 'has', 'into',
    'people', 'came', 'come', 'some', 'one', 'day', 'life', 'would',
    'could', 'should', 'there', 'their', 'then', 'than', 'when', 'where',
    'what', 'which', 'after', 'before', 'only', 'again', 'still',
]);

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function loadSourceLibrary() {
    if (!fs.existsSync(SOURCE_LIBRARY_PATH)) {
        throw new Error('Source library not found: ' + SOURCE_LIBRARY_PATH);
    }
    return readJson(SOURCE_LIBRARY_PATH);
}

function loadSaintsScript(videoId) {
    const filePath = path.join(SCRIPTS_DIR, 'saints_video_' + videoId + '_data.js');
    if (!fs.existsSync(filePath)) {
        throw new Error('Saints script not found: ' + filePath);
    }

    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const re = new RegExp('window\\.SAINTS_SCRIPTS\\[' + videoId + '\\]\\s*=\\s*(\\{[\\s\\S]*\\})\\s*;?\\s*$');
    const match = raw.match(re);
    if (!match) {
        throw new Error('Cannot parse SAINTS_SCRIPTS[' + videoId + '] from ' + filePath);
    }

    return JSON.parse(match[1]);
}

function cleanText(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function estimateDuration(voiceover) {
    const clean = cleanText(voiceover);
    if (!clean) return 0;
    const words = clean.split(/\s+/).length;
    const pauseCount = (String(voiceover).match(/<span class="pause">/g) || []).length;
    return Math.max(8, Math.round((words / WORDS_PER_SECOND) + pauseCount * 1.5));
}

function splitIntoBeats(voiceover, target) {
    const clean = cleanText(voiceover);
    const sentences = clean.match(/[^.!?]+[.!?]+/g) || (clean ? [clean] : []);
    if (sentences.length <= target) {
        return sentences.map(function(s) { return s.trim(); }).filter(Boolean);
    }

    const beats = [];
    const size = Math.ceil(sentences.length / target);
    for (let i = 0; i < sentences.length; i += size) {
        const chunk = sentences.slice(i, i + size).join(' ').trim();
        if (chunk) beats.push(chunk);
    }
    return beats.slice(0, target);
}

function assignTimings(beats, sceneDuration, sceneStart) {
    const wordCounts = beats.map(function(beat) {
        return Math.max(1, cleanText(beat).split(/\s+/).length);
    });
    const totalWords = wordCounts.reduce(function(total, count) { return total + count; }, 0);
    let cursor = sceneStart;

    return beats.map(function(beat, i) {
        const duration = Math.max(4, Math.round(sceneDuration * (wordCounts[i] / totalWords)));
        const timing = { start_s: cursor, duration_s: duration };
        cursor += duration;
        return timing;
    });
}

function normalizeWords(text) {
    return cleanText(text)
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(function(word) {
            return word.length > 3 && !STOP_WORDS.has(word);
        });
}

function buildSearchQuery(parts, suffix) {
    const words = [];
    parts.forEach(function(part) {
        normalizeWords(part).forEach(function(word) {
            if (words.indexOf(word) === -1) words.push(word);
        });
    });
    const core = words.slice(0, 7).join(' ');
    return (core + ' ' + suffix).trim();
}

function wikimediaSearchUrl(query) {
    return 'https://commons.wikimedia.org/w/index.php?search=' +
        encodeURIComponent(query.replace(/\s*site:[^\s]+/g, '').trim()) +
        '&title=Special:MediaSearch&type=image';
}

function locSearchUrl(query) {
    return 'https://www.loc.gov/search/?fa=online-format:image&q=' +
        encodeURIComponent(query.replace(/\s*site:[^\s]+/g, '').trim());
}

function findSaintTarget(library, videoId, title) {
    const videoCode = 'SAINTS-' + String(videoId).padStart(3, '0');
    const targets = library.saint_asset_targets || [];

    return targets.find(function(target) {
        return (target.video_ids || []).indexOf(videoCode) !== -1;
    }) || targets.find(function(target) {
        return title && title.toLowerCase().indexOf(String(target.saint || '').toLowerCase().replace(/^saint\s+/, '')) !== -1;
    }) || null;
}

function sourceFromTarget(target, preferredIndex) {
    if (!target || !target.primary_visuals || !target.primary_visuals.length) return null;
    return target.primary_visuals[Math.min(preferredIndex || 0, target.primary_visuals.length - 1)];
}

function targetName(target) {
    return String(target && target.saint || '').toLowerCase();
}

function isAthoniteTarget(target) {
    return /\b(paisios|paisius|velichkovsky|silouan|athonite|athos|neam)\b/i.test(targetName(target));
}

function isAlaskaTarget(target) {
    return /\b(herman|alaska|spruce|kodiak)\b/i.test(targetName(target));
}

function isSergiusTarget(target) {
    return /\b(sergius|radonezh|lavra)\b/i.test(targetName(target));
}

function locationSourceForTarget(library, target) {
    if (isAlaskaTarget(target)) {
        return sourceFromTarget(target, 1) || generalSource(library, 'alaska') || generalSource(library, 'spruce');
    }
    if (isSergiusTarget(target)) {
        return sourceFromTarget(target, 1) || generalSource(library, 'trinity lavra') || generalSource(library, 'sergius');
    }
    if (isAthoniteTarget(target)) {
        return generalSource(library, 'mount athos') || generalSource(library, 'icons in mount athos') || sourceFromTarget(target, 1);
    }
    return generalSource(library, 'optina') || sourceFromTarget(target, 1);
}

function saintIconQuery(target) {
    const saint = target && target.saint ? target.saint : 'Orthodox saint';
    return saint + ' icon portrait Wikimedia Commons';
}

function monasteryQueryForTarget(target) {
    if (isAlaskaTarget(target)) return 'Spruce Island Kodiak Alaska Orthodox monastery Wikimedia Commons';
    if (isSergiusTarget(target)) return 'Trinity Lavra of St Sergius Radonezh forest monastery Wikimedia Commons';
    if (/\b(paisius|velichkovsky|neam)\b/i.test(targetName(target))) return 'Mount Athos Neamt Monastery Paisius Velichkovsky Wikimedia Commons';
    if (isAthoniteTarget(target)) return 'Mount Athos monastery path cell Wikimedia Commons';
    return 'Optina Pustyn monastery Wikimedia Commons';
}

function generalSource(library, labelPart) {
    const sources = library.general_sources || [];
    const needle = String(labelPart || '').toLowerCase();
    return sources.find(function(source) {
        return String(source.label || '').toLowerCase().indexOf(needle) !== -1;
    }) || null;
}

function recommendVisual(beatText, scene, data, library, saintTarget) {
    const combined = (scene.title + ' ' + beatText + ' ' + (scene.visual_prompt || '')).toLowerCase();
    const saintSource = sourceFromTarget(saintTarget, 0);
    const locationSource = locationSourceForTarget(library, saintTarget);
    const athonite = isAthoniteTarget(saintTarget);
    const alaskan = isAlaskaTarget(saintTarget);
    const sergian = isSergiusTarget(saintTarget);
    const locationLabel = alaskan ? 'Spruce Island, Kodiak, Alaska mission, or northern Orthodox location imagery' : (sergian ? 'Trinity Lavra, Radonezh forest, or Russian forest-monastery imagery' : (athonite ? 'Mount Athos monastery/location imagery' : 'Optina Pustyn exterior/interior or Russian monastic location imagery'));
    const locationQuery = monasteryQueryForTarget(saintTarget);

    if (/\b(letter|letters|wrote|replies|dictated|ink|manuscript|book|gospel|pages|novel|brothers karamazov)\b/i.test(combined)) {
        return {
            visual_type: VISUAL_TYPES.MANUSCRIPT,
            asset_note: 'Use manuscripts, handwritten letters, old books, or generated letter-table closeups.',
            primary_source_label: 'Wikimedia manuscript and book search',
            primary_source_url: wikimediaSearchUrl(buildSearchQuery([scene.title, beatText], alaskan ? 'Russian America mission letter manuscript' : (sergian ? 'medieval Russian manuscript Sergius Radonezh' : (athonite ? 'Orthodox manuscript prayer book Mount Athos' : 'Russian manuscript letter book')))),
            backup_source_url: locSearchUrl(buildSearchQuery([scene.title, beatText], alaskan ? 'Alaska mission manuscript Orthodox' : (sergian ? 'medieval Russian manuscript monastery' : (athonite ? 'Orthodox manuscript prayer book' : '19th century Russian book manuscript')))),
            search_query: buildSearchQuery([scene.title, beatText], alaskan ? 'Russian America mission letter manuscript Wikimedia Commons' : (sergian ? 'medieval Russian manuscript Sergius Radonezh Wikimedia Commons' : (athonite ? 'Orthodox manuscript prayer book Wikimedia Commons' : 'Russian manuscript letter book Wikimedia Commons'))),
            source_priority: 2,
        };
    }

    if (/\b(dostoevsky|writer|alyosha|zosima|karamazov|seminary|student|teacher|alexander grenkov|macarius|educated|intellectual|merchant|soldier|noblewoman|widow|mother)\b/i.test(combined)) {
        return {
            visual_type: VISUAL_TYPES.PORTRAIT,
            asset_note: 'Use a public-domain portrait of the named historical figure or a seminary/book visual.',
            primary_source_label: 'Wikimedia historical portrait search',
            primary_source_url: wikimediaSearchUrl(buildSearchQuery([scene.title, beatText], 'portrait Wikimedia Commons')),
            backup_source_url: wikimediaSearchUrl('Fyodor Dostoevsky portrait public domain'),
            search_query: buildSearchQuery([scene.title, beatText], 'portrait public domain Wikimedia Commons'),
            source_priority: 2,
        };
    }

    if (/\b(optina|monastery|pustyn|cell|door|pilgrim|pilgrims|road|russia|tambov|province|church|window|dawn|sunrise|waiting|visitors|brethren|spiritual hospital|athos|athonite|mountain|hut|path|sea|cappadocia|greece|alaska|spruce|kodiak|island|valaam|missionary|northern)\b/i.test(combined)) {
        return {
            visual_type: VISUAL_TYPES.MONASTERY,
            asset_note: 'Use ' + locationLabel + '.',
            primary_source_label: locationSource ? locationSource.label : locationQuery,
            primary_source_url: locationSource ? locationSource.url : wikimediaSearchUrl(locationQuery),
            backup_source_url: saintSource ? saintSource.url : wikimediaSearchUrl(saintIconQuery(saintTarget)),
            search_query: buildSearchQuery([scene.title, beatText], locationQuery),
            source_priority: 1,
        };
    }

    if (/\b(across russia|province|road|journey|world|memory|culture|cappadocia|greece|souls|exile)\b/i.test(combined)) {
        return {
            visual_type: VISUAL_TYPES.MAP,
            asset_note: 'Use a map, route graphic, or monastery-location establishing shot.',
            primary_source_label: 'Wikimedia map/location search',
            primary_source_url: wikimediaSearchUrl(buildSearchQuery([scene.title, beatText], alaskan ? 'Russia Alaska Kodiak missionary route map' : (sergian ? 'Rostov Radonezh Trinity Lavra map' : (athonite ? 'Cappadocia Greece Mount Athos map' : 'Russia map monastery')))),
            backup_source_url: locationSource ? locationSource.url : wikimediaSearchUrl(locationQuery),
            search_query: buildSearchQuery([scene.title, beatText], alaskan ? 'Russia Alaska Kodiak missionary route map Wikimedia Commons' : (sergian ? 'Rostov Radonezh Trinity Lavra map Wikimedia Commons' : (athonite ? 'Cappadocia Greece Mount Athos map Wikimedia Commons' : 'Russia map monastery Wikimedia Commons'))),
            source_priority: 3,
        };
    }

    if (/\b(ambrose|paisios|silouan|saint|icon|blessing|holy|weak monk|elder's cell|reposed|grace|repentance|holiness|discernment|prayer)\b/i.test(combined)) {
        return {
            visual_type: VISUAL_TYPES.ICON,
            asset_note: 'Use the saint portrait/icon as a reverent anchor image.',
            primary_source_label: saintSource ? saintSource.label : 'Saint portrait/icon search',
            primary_source_url: saintSource ? saintSource.url : wikimediaSearchUrl(saintIconQuery(saintTarget)),
            backup_source_url: locationSource ? locationSource.url : wikimediaSearchUrl(locationQuery),
            search_query: saintIconQuery(saintTarget),
            source_priority: 1,
        };
    }

    return {
        visual_type: VISUAL_TYPES.GENERATED,
        asset_note: 'Use a reverent atmospheric card only if no licensed icon, painting, location, or manuscript asset fits.',
        primary_source_label: 'Generated fallback',
        primary_source_url: null,
        backup_source_url: locationSource ? locationSource.url : (saintSource ? saintSource.url : null),
        search_query: '[GENERATE] ' + buildSearchQuery([scene.title, beatText, scene.visual_prompt], 'reverent Orthodox documentary card'),
        source_priority: 4,
    };
}

function sceneAnchorVisual(scene, library, saintTarget) {
    const saintSource = sourceFromTarget(saintTarget, 0);
    const locationSource = locationSourceForTarget(library, saintTarget);
    const locationQuery = monasteryQueryForTarget(saintTarget);
    const athonite = isAthoniteTarget(saintTarget);
    const alaskan = isAlaskaTarget(saintTarget);
    const sergian = isSergiusTarget(saintTarget);
    const title = String(scene.title || '').toLowerCase();

    if (alaskan && /island|alaska|spruce|missionary|valaam|children|north|stayed/.test(title)) {
        return {
            visual_type: VISUAL_TYPES.MONASTERY,
            asset_note: 'Opening/scene anchor: use Spruce Island, Kodiak, Alaska Orthodox pilgrimage, Valaam context, or northern missionary landscape imagery.',
            primary_source_label: locationSource ? locationSource.label : 'Spruce Island / Kodiak Alaska Commons search',
            primary_source_url: locationSource ? locationSource.url : wikimediaSearchUrl(locationQuery),
            backup_source_url: saintSource ? saintSource.url : wikimediaSearchUrl(saintIconQuery(saintTarget)),
            search_query: locationQuery,
            source_priority: 1,
        };
    }

    if (sergian && /forest|lavra|child|world|brothers|bear|violent|blessing|trinity|hidden/.test(title)) {
        return {
            visual_type: VISUAL_TYPES.MONASTERY,
            asset_note: 'Opening/scene anchor: use Trinity Lavra, Radonezh forest monastery, Holy Trinity context, or restrained medieval Russian visual.',
            primary_source_label: locationSource ? locationSource.label : 'Trinity Lavra / Radonezh Commons search',
            primary_source_url: locationSource ? locationSource.url : wikimediaSearchUrl(locationQuery),
            backup_source_url: saintSource ? saintSource.url : wikimediaSearchUrl(saintIconQuery(saintTarget)),
            search_query: locationQuery,
            source_priority: 1,
        };
    }

    if (athonite && /path|mountain|hidden|age|poverty|labor|restless|water|hut/.test(title)) {
        return {
            visual_type: VISUAL_TYPES.MONASTERY,
            asset_note: 'Opening/scene anchor: use Mount Athos path, cell, monastery, sea, or reverent Athonite atmosphere.',
            primary_source_label: locationSource ? locationSource.label : 'Mount Athos Commons search',
            primary_source_url: locationSource ? locationSource.url : wikimediaSearchUrl(locationQuery),
            backup_source_url: saintSource ? saintSource.url : wikimediaSearchUrl(saintIconQuery(saintTarget)),
            search_query: locationQuery,
            source_priority: 1,
        };
    }

    if (/line outside|spiritual hospital/.test(title)) {
        return {
            visual_type: VISUAL_TYPES.MONASTERY,
            asset_note: 'Opening/legacy anchor: Optina Pustyn as the place where the story happens.',
            primary_source_label: locationSource ? locationSource.label : 'Optina Pustyn Commons category',
            primary_source_url: locationSource ? locationSource.url : wikimediaSearchUrl('Optina Pustyn monastery'),
            backup_source_url: saintSource ? saintSource.url : wikimediaSearchUrl(saintIconQuery(saintTarget)),
            search_query: 'Optina Pustyn monastery Wikimedia Commons',
            source_priority: 1,
        };
    }

    if (/promise/.test(title)) {
        return {
            visual_type: VISUAL_TYPES.PORTRAIT,
            asset_note: 'Biographical anchor: use a historical portrait/icon of Saint Ambrose or young seminarian context.',
            primary_source_label: saintSource ? saintSource.label : 'Saint portrait search',
            primary_source_url: saintSource ? saintSource.url : wikimediaSearchUrl(saintIconQuery(saintTarget)),
            backup_source_url: locationSource ? locationSource.url : wikimediaSearchUrl(locationQuery),
            search_query: saintIconQuery(saintTarget),
            source_priority: 1,
        };
    }

    if (/letters/.test(title)) {
        return {
            visual_type: VISUAL_TYPES.MANUSCRIPT,
            asset_note: 'Letter anchor: use manuscripts, old books, or handwritten counsel imagery.',
            primary_source_label: 'Wikimedia manuscript and book search',
            primary_source_url: wikimediaSearchUrl('Saint Ambrose of Optina letters manuscript'),
            backup_source_url: locSearchUrl('19th century Russian manuscript letter'),
            search_query: 'Saint Ambrose of Optina letters manuscript Wikimedia Commons',
            source_priority: 2,
        };
    }

    if (/writer/.test(title)) {
        return {
            visual_type: VISUAL_TYPES.PORTRAIT,
            asset_note: 'Dostoevsky anchor: use a public-domain portrait or manuscript image.',
            primary_source_label: 'Fyodor Dostoevsky portrait search',
            primary_source_url: wikimediaSearchUrl('Fyodor Dostoevsky portrait public domain'),
            backup_source_url: wikimediaSearchUrl('The Brothers Karamazov first edition'),
            search_query: 'Fyodor Dostoevsky portrait public domain Wikimedia Commons',
            source_priority: 1,
        };
    }

    return {
        visual_type: VISUAL_TYPES.ICON,
        asset_note: 'Scene anchor: use the saint portrait/icon as a reverent recurring visual.',
        primary_source_label: saintSource ? saintSource.label : 'Saint portrait/icon search',
        primary_source_url: saintSource ? saintSource.url : wikimediaSearchUrl(saintIconQuery(saintTarget)),
        backup_source_url: locationSource ? locationSource.url : wikimediaSearchUrl(locationQuery),
        search_query: saintIconQuery(saintTarget),
        source_priority: 1,
    };
}

function buildPlan(videoId, data, library) {
    const saintTarget = findSaintTarget(library, videoId, data.video && data.video.title);
    let runtime = 0;

    const scenes = data.scenes.map(function(scene) {
        const duration = estimateDuration(scene.voiceover);
        const targetBeats = duration <= 25 ? 2 : duration <= 45 ? 3 : duration <= 70 ? 4 : 5;
        const beatTexts = splitIntoBeats(scene.voiceover, targetBeats);
        const timings = assignTimings(beatTexts, duration, runtime);

        const beats = beatTexts.map(function(text, index) {
            const recommendation = index === 0
                ? sceneAnchorVisual(scene, library, saintTarget)
                : recommendVisual(text, scene, data, library, saintTarget);
            const beatId = scene.scene_number + String.fromCharCode(97 + index);
            return {
                beat_id: beatId,
                start_s: timings[index].start_s,
                duration_s: timings[index].duration_s,
                narration_excerpt: text.slice(0, 160) + (text.length > 160 ? '...' : ''),
                visual_type: recommendation.visual_type,
                asset_note: recommendation.asset_note,
                primary_source_label: recommendation.primary_source_label,
                primary_source_url: recommendation.primary_source_url,
                backup_source_url: recommendation.backup_source_url,
                search_query: recommendation.search_query,
                source_priority: recommendation.source_priority,
                asset_file: null,
                attribution_required: recommendation.visual_type !== VISUAL_TYPES.GENERATED,
                license_status: 'verify_per_file_before_use',
                status: 'pending',
                fallback: 'scene_' + scene.scene_number + '_image.png',
                suggested_filename: 'beat_' + beatId + '.jpg',
            };
        });

        const plannedScene = {
            scene_number: scene.scene_number,
            title: scene.title,
            start_s: runtime,
            duration_s: duration,
            beat_count: beats.length,
            visual_prompt: scene.visual_prompt || '',
            primary_asset_file: 'scene_' + scene.scene_number + '_image.png',
            beats: beats,
        };

        runtime += duration;
        return plannedScene;
    });

    return {
        channel: data.video.channel || 'The Saints',
        video_id: videoId,
        title: data.video.title,
        niche: data.video.niche,
        generated_at: new Date().toISOString(),
        estimated_total_duration_s: runtime,
        total_beats: scenes.reduce(function(total, scene) { return total + scene.beat_count; }, 0),
        saint_target: saintTarget ? saintTarget.saint : null,
        source_mix_target: {
            icons_and_paintings: '35-50%',
            monastery_and_location: '20-30%',
            manuscripts_books_maps: '10-20%',
            generated_atmospheric_cards: 'remainder only',
        },
        usage_rules: library.usage_rules || [],
        first_download_priority: library.first_download_priority || [],
        scenes: scenes,
    };
}

function writePlan(videoId, plan) {
    const outputDir = path.join(ASSETS_DIR, 'saints_video_' + videoId + '_assets');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'visual_plan.json');
    fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2));
    return outputPath;
}

function pad(value, size) {
    return String(value).padEnd(size);
}

function printSummary(videoId, plan, outputPath) {
    const minutes = Math.floor(plan.estimated_total_duration_s / 60);
    const seconds = plan.estimated_total_duration_s % 60;
    const counts = {};

    plan.scenes.forEach(function(scene) {
        scene.beats.forEach(function(beat) {
            counts[beat.visual_type] = (counts[beat.visual_type] || 0) + 1;
        });
    });

    console.log('\n' + '='.repeat(70));
    console.log('SAINTS VIDEO ' + videoId + ': ' + plan.title);
    console.log('Saint target: ' + (plan.saint_target || 'not matched'));
    console.log('Duration estimate: ' + minutes + 'm ' + seconds + 's');
    console.log('Total beats: ' + plan.total_beats + ' across ' + plan.scenes.length + ' scenes');
    console.log('\nVisual source breakdown:');
    Object.keys(counts).sort().forEach(function(type) {
        const pct = Math.round((counts[type] / plan.total_beats) * 100);
        console.log('  ' + pad(type, 32) + counts[type] + ' beats (' + pct + '%)');
    });

    console.log('\nPriority source beats:');
    let shown = 0;
    plan.scenes.forEach(function(scene) {
        scene.beats.forEach(function(beat) {
            if (shown < 8 && beat.source_priority <= 2) {
                console.log('  [' + beat.beat_id + '] ' + beat.visual_type + ' - ' + beat.primary_source_label);
                console.log('       ' + beat.search_query);
                if (beat.primary_source_url) console.log('       ' + beat.primary_source_url);
                shown++;
            }
        });
    });

    console.log('\nPlan written: ' + outputPath);
}

function parseArgs() {
    const args = process.argv.slice(2);
    const inline = args.find(function(arg) { return arg.indexOf('--video=') === 0; });
    if (inline) {
        return inline.replace('--video=', '').split(',').map(function(id) { return Number(id.trim()); }).filter(Boolean);
    }

    const idx = args.indexOf('--video');
    if (idx !== -1 && args[idx + 1]) {
        return args[idx + 1].split(',').map(function(id) { return Number(id.trim()); }).filter(Boolean);
    }

    return [13];
}

function main() {
    const ids = parseArgs();
    const library = loadSourceLibrary();

    console.log('\nSaints Visual Asset Planner');
    console.log('Videos: ' + ids.join(', '));

    ids.forEach(function(videoId) {
        try {
            const data = loadSaintsScript(videoId);
            const plan = buildPlan(videoId, data, library);
            const outputPath = writePlan(videoId, plan);
            printSummary(videoId, plan, outputPath);
        } catch (error) {
            console.error('Video ' + videoId + ' failed: ' + error.message);
        }
    });

    console.log('\nNext steps:');
    console.log('  1. Open assets/saints_video_N_assets/visual_plan.json');
    console.log('  2. Download real icon, painting, monastery, portrait, or manuscript assets first');
    console.log('  3. Save files as beat_1a.jpg, beat_1b.jpg, etc.');
    console.log('  4. Record the exact file page/license in asset_attribution.json');
    console.log('  5. Use generated cards only where the plan marks conceptual fallback');
}

main();
