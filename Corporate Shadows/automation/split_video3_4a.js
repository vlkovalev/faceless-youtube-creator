const fs = require('fs');
const path = require('path');
const planPath = path.join('assets', 'video_3_assets', 'visual_plan.json');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8').replace(/^\uFEFF/, ''));
const scene4 = plan.scenes.find(scene => Number(scene.scene_number) === 4);
if (!scene4) throw new Error('Scene 4 not found');
if (!scene4.beats.some(beat => beat.beat_id === '4a2')) {
  const next = [];
  for (const beat of scene4.beats) {
    if (beat.beat_id === '4a') {
      beat.duration_s = 16;
      beat.narration_excerpt = 'The economic equation was simple: if a customer only needs to buy a lightbulb once in their lifetime...';
      next.push(beat);
      next.push({
        beat_id: '4a2',
        start_s: Number(beat.start_s || 143) + 16,
        duration_s: 15,
        narration_excerpt: '...your market eventually disappears. Durability became the threat. Failure became the business model.',
        asset_type: 'generated_graphic',
        asset_note: 'animated stat or chart graphic',
        search_query: 'lifetime customers killed repeat sales -- dark corporate documentary style',
        source_url: null,
        asset_file: 'assets/video_3_assets/beat_4a2.png',
        status: 'downloaded',
        fallback: 'scene_4_image.png',
        selected_source_title: 'Generated documentary beat: Lifetime Customers Kill Repeat Sales',
        selected_source_license: 'Original generated production graphic'
      });
    } else {
      next.push(beat);
    }
  }
  scene4.beats = next;
  scene4.beat_count = next.length;
}
plan.split_4a_for_pacing = {
  completed_at: new Date().toISOString(),
  note: 'Split long 4a economics hold into 4a and 4a2 after scrub showed slide-like pacing.'
};
fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
console.log(JSON.stringify(scene4.beats.filter(beat => String(beat.beat_id).startsWith('4a')), null, 2));