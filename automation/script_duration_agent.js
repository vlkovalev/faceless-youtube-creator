const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.join(__dirname, '..');
const SCRIPT_ID = process.argv[2] || '5';
const MIN_WORDS = Number(process.env.MIN_LONG_FORM_WORDS || 1100);
const TARGET_MIN_WORDS = Number(process.env.TARGET_LONG_FORM_WORDS_MIN || 1250);
const TARGET_MAX_WORDS = Number(process.env.TARGET_LONG_FORM_WORDS_MAX || 1650);
const ESTIMATED_WPM = Number(process.env.ESTIMATED_TTS_WPM || 135);

function stripMarkup(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text) {
  return (stripMarkup(text).match(/\b[\w'-]+\b/g) || []).length;
}

function parseScript(id) {
  const dataPath = path.join(WORKSPACE_DIR, 'scripts', `video_${id}_data.js`);
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Missing script data: ${dataPath}`);
  }

  const raw = fs.readFileSync(dataPath, 'utf8');
  const match = raw.match(new RegExp(`window\\.SCRIPTS\\[${id}\\]\\s*=\\s*(\\{[\\s\\S]+\\});`));
  if (!match) {
    throw new Error(`Could not parse script data for video ${id}`);
  }

  return JSON.parse(match[1]);
}

function analyzeScript(id) {
  const script = parseScript(id);
  const sceneReports = script.scenes.map(scene => ({
    scene_number: scene.scene_number,
    title: scene.title,
    word_count: countWords(scene.voiceover)
  }));
  const totalWords = sceneReports.reduce((sum, scene) => sum + scene.word_count, 0);
  const estimatedSeconds = Math.round((totalWords / ESTIMATED_WPM) * 60);

  return {
    script_id: Number(id),
    title: script.video.title,
    total_words: totalWords,
    estimated_seconds: estimatedSeconds,
    estimated_minutes: Number((estimatedSeconds / 60).toFixed(1)),
    target_words: `${TARGET_MIN_WORDS}-${TARGET_MAX_WORDS}`,
    minimum_words: MIN_WORDS,
    status: totalWords >= MIN_WORDS ? 'passed' : 'failed',
    scenes: sceneReports
  };
}

function main() {
  const report = analyzeScript(SCRIPT_ID);
  const outDir = path.join(WORKSPACE_DIR, 'metadata', 'script_qc_reports');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `video_${SCRIPT_ID}_script_duration_report.json`), JSON.stringify(report, null, 2));

  console.log(`Script duration QC for video ${SCRIPT_ID}: ${report.status}`);
  console.log(`Words: ${report.total_words} / ${report.minimum_words} minimum (${report.target_words} target)`);
  console.log(`Estimated runtime: ${report.estimated_minutes} minutes at ${ESTIMATED_WPM} WPM`);

  if (report.status !== 'passed') {
    console.error('Script is too short for monetization-focused long-form production.');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { analyzeScript, countWords };
