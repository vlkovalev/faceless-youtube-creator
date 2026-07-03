/**
 * formula_acts.js
 *
 * Loads the canonical Corporate Shadows visual formula
 * (docs/visual_formula_template.json) and exposes its 7 acts as fractions
 * of total runtime, so callers can classify any script's scenes/beats into
 * acts regardless of that script's actual length.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FORMULA_PATH = path.join(__dirname, '..', 'docs', 'visual_formula_template.json');

function loadFormulaActs() {
    var raw = JSON.parse(fs.readFileSync(FORMULA_PATH, 'utf8'));
    var total = raw.total_duration_seconds;
    var cursor = 0;
    return raw.acts.map(function(a) {
        var startFrac = cursor / total;
        cursor += a.duration_seconds;
        var endFrac = cursor / total;
        var aiPromptStyle = a.ai_prompt ||
            (a.visuals.slice(0, 3).join(', ') + ', cinematic documentary, ultra realistic, dark corporate thriller aesthetic, Netflix style');
        return {
            key: a.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
            name: a.name,
            startFrac: startFrac,
            endFrac: endFrac,
            bRoll: a.visuals,
            soundDesign: a.sound_design || [],
            cameraStyle: a.camera_style || [],
            aiPromptStyle: aiPromptStyle,
        };
    });
}

function actForFraction(acts, frac) {
    for (var i = 0; i < acts.length; i++) {
        if (frac < acts[i].endFrac || i === acts.length - 1) return acts[i];
    }
    return acts[acts.length - 1];
}

module.exports = { FORMULA_PATH, loadFormulaActs, actForFraction };
