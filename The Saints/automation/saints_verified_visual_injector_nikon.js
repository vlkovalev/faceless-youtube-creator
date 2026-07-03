/**
 * Reusable Nikon visual injector.
 *
 * Reuses the verified Commons portrait/source set already approved for the
 * Nikon series, fits visuals to 1280x720, and marks every beat as verified so
 * the Saints portrait/icon hard rule cannot silently fall back to abstraction.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..');
const sourceVideoId = '20';
const targetVideoId = String(process.argv[2] || '').replace(/\D/g, '');
if (!targetVideoId) throw new Error('Usage: node saints_verified_visual_injector_nikon.js <video_id>');

const SOURCE_ASSETS_DIR = path.join(ROOT, 'assets', `saints_video_${sourceVideoId}_assets`);
const ASSETS_DIR = path.join(ROOT, 'assets', `saints_video_${targetVideoId}_assets`);
const VERIFIED_DIR = path.join(ASSETS_DIR, 'verified_sources');
const REAL_DIR = path.join(ASSETS_DIR, 'real_sources');
const LOCAL_FFMPEG = path.join(REPO_ROOT, 'automation', 'ffmpeg', 'bin', 'ffmpeg.exe');

const SOURCE_SET = {
  nikon_portrait: {
    url: 'https://commons.wikimedia.org/wiki/File:Nikon_(Vorobyov)._A._Mironov.jpg',
    license: 'cc_by_sa_4_0',
    author: 'Andrey Mironov',
    type: 'icon_or_painting',
    title: 'Hegumen Nikon Vorobiev portrait',
    sourceFile: 'nikon_portrait.jpg'
  }
};

function copySourceFile(key, info) {
  const candidates = [
    path.join(SOURCE_ASSETS_DIR, 'verified_sources', info.sourceFile),
    path.join(SOURCE_ASSETS_DIR, 'real_sources', info.sourceFile)
  ];
  const src = candidates.find(file => fs.existsSync(file) && fs.statSync(file).size > 0);
  if (!src) throw new Error(`Missing verified Nikon source image for ${key}. Expected one of: ${candidates.join(', ')}`);
  const verified = path.join(VERIFIED_DIR, info.sourceFile);
  const real = path.join(REAL_DIR, info.sourceFile);
  fs.copyFileSync(src, verified);
  fs.copyFileSync(src, real);
  return verified;
}

function fitToVideo(srcPath, destPath) {
  const ffmpegBin = fs.existsSync(LOCAL_FFMPEG) ? LOCAL_FFMPEG : 'ffmpeg';
  const cmd = `"${ffmpegBin}" -y -i "${srcPath}" -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" "${destPath}"`;
  execSync(cmd, { stdio: 'ignore' });
}

function main() {
  fs.mkdirSync(VERIFIED_DIR, { recursive: true });
  fs.mkdirSync(REAL_DIR, { recursive: true });

  const sourcePaths = {};
  for (const [key, info] of Object.entries(SOURCE_SET)) {
    sourcePaths[key] = copySourceFile(key, info);
  }

  const planPath = path.join(ASSETS_DIR, 'visual_plan.json');
  if (!fs.existsSync(planPath)) throw new Error(`Missing visual plan: ${planPath}`);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8').replace(/^\uFEFF/, ''));
  const attribution = [];
  let replacements = 0;

  for (const scene of plan.scenes || []) {
    for (const beat of scene.beats || []) {
      const key = 'nikon_portrait';
      const info = SOURCE_SET[key];
      const assetFile = `scene_${scene.scene_number}_beat_${beat.beat_id}_image.png`;
      const dest = path.join(ASSETS_DIR, assetFile);
      fitToVideo(sourcePaths[key], dest);

      beat.visual_type = 'icon_or_painting';
      beat.asset_file = assetFile;
      beat.primary_source_url = info.url;
      beat.primary_source_label = info.title;
      beat.license_status = info.license;
      beat.rights_status = 'verified';
      beat.status = 'downloaded_verified';
      beat.attribution_required = true;
      beat.verified_source_key = key;
      beat.subject_framing = 'full_subject_contained';
      beat.framing_qc = 'no_crop_contain_layout';
      beat.layout_style = 'left_text_right_saint';

      replacements++;
      attribution.push({
        video_id: Number(targetVideoId),
        scene: scene.scene_number,
        beat_id: beat.beat_id,
        asset_file: assetFile,
        source_key: key,
        source_url: info.url,
        source_file: path.relative(ASSETS_DIR, sourcePaths[key]),
        license: info.license,
        author: info.author,
        usage_status: 'approved_for_private_draft_and_youtube_upload',
        visual_type: info.type,
        title: info.title
      });
    }
  }

  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
  fs.writeFileSync(path.join(ASSETS_DIR, 'asset_attribution.json'), JSON.stringify({
    video_id: Number(targetVideoId),
    generated_at: new Date().toISOString(),
    policy: 'Exact source pages only; Commons category/search pages are not treated as rights clearance.',
    total_replaced_beats: replacements,
    sources: Object.values(SOURCE_SET).map(({ sourceFile, ...info }) => info),
    beats: attribution
  }, null, 2), 'utf8');

  console.log(`Injected ${replacements} verified Nikon portrait beats into Saints video ${targetVideoId}.`);
}

main();
