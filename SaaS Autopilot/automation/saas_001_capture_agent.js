'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'saas_autopilot', 'saas_001_data.json');
const ASSET_DIR = path.join(ROOT, 'assets', 'saas_autopilot_assets', 'saas_001');
const FFMPEG = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');
const FFPROBE = path.join(__dirname, 'ffmpeg', 'bin', 'ffprobe.exe');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const NODE_MODULES = 'C:\\Users\\heliu\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';
const FORCE_SCENES = new Set(String(process.env.SAAS_CAPTURE_FORCE_SCENES || '').split(',').map(value => Number(value.trim())).filter(Boolean));
const FRAME_HOLD_SECONDS = 5;

function mediaDuration(file) {
  const result = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`ffprobe failed for ${file}`);
  return Number(result.stdout.trim());
}

function sourceText(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) return `File unavailable: ${relativePath}`;
  return fs.readFileSync(absolute, 'utf8').slice(0, 18000);
}

function focusedSourceText(scene) {
  const full = sourceText(scene.source_file).split(/\r?\n/);
  const terms = Array.isArray(scene.focus_terms) ? scene.focus_terms.map(term => String(term).toLowerCase()) : [];
  if (!terms.length) return full.slice(0, 65).join('\n');
  const selected = new Set();
  full.forEach((line, index) => {
    if (terms.some(term => line.toLowerCase().includes(term))) {
      for (let offset = -2; offset <= 4; offset += 1) {
        if (index + offset >= 0 && index + offset < full.length) selected.add(index + offset);
      }
    }
  });
  const indexes = [...selected].sort((a, b) => a - b).slice(0, 65);
  return indexes.length ? indexes.map(index => `${String(index + 1).padStart(3, ' ')}  ${full[index]}`).join('\n') : full.slice(0, 65).join('\n');
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pageHtml(scene, duration) {
  const code = focusedSourceText(scene).split(/\r?\n/).map((line, index) =>
    `<div class="line" data-line="${index}"><span>${String(index + 1).padStart(3, ' ')}</span>${escapeHtml(line || ' ')}</div>`
  ).join('');
  const steps = scene.demo_steps.map((step, index) =>
    `<button class="step" data-step="${index}"><b>${index + 1}. ${escapeHtml(step.action_type.toUpperCase())}</b><small>${escapeHtml(step.ui_target)}</small></button>`
  ).join('');
  const outputs = scene.demo_steps.map(step => escapeHtml(step.expected_result));
  const commands = scene.demo_steps.map(step => escapeHtml(step.sample_input));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html{background:#0b0f16}body{width:1920px;height:1080px;transform:scale(.6666667);transform-origin:top left;margin:0;background:#0b0f16;color:#e6edf3;font-family:Segoe UI,Arial,sans-serif;overflow:hidden;letter-spacing:0}
  header{height:84px;background:#111827;border-bottom:1px solid #334155;display:flex;align-items:center;padding:0 34px;gap:20px}
  .brand{font-size:20px;font-weight:700;color:#38bdf8}.title{font-size:28px;font-weight:650}.pilot{margin-left:auto;color:#86efac;font-size:16px}
  main{display:grid;grid-template-columns:310px 1fr;grid-template-rows:650px 346px;height:996px}
  aside{grid-row:1/3;background:#0f172a;border-right:1px solid #334155;padding:24px 18px}.label{font-size:13px;color:#94a3b8;text-transform:uppercase;margin:0 10px 14px}
  .step{width:100%;min-height:92px;text-align:left;background:#111827;color:#e2e8f0;border:1px solid #334155;padding:14px;margin-bottom:12px;border-radius:6px}
  .step b{display:block;color:#7dd3fc;font-size:16px}.step small{display:block;margin-top:8px;font-size:14px;line-height:1.3}.step.active{border-color:#22c55e;background:#052e2b;box-shadow:inset 4px 0 #22c55e}
  .editor{background:#0d1117;overflow:hidden;position:relative}.tabs{height:48px;background:#161b22;border-bottom:1px solid #30363d;padding:13px 22px;color:#f8fafc}.code{height:602px;overflow:hidden;padding:18px 0;font:22px/1.6 Consolas,monospace}
  .line{white-space:pre;padding:0 24px;min-height:28px}.line span{display:inline-block;width:58px;color:#64748b;user-select:none}.line.active{background:#172554;border-left:4px solid #38bdf8;padding-left:20px;color:#fff}
  .bottom{background:#111827;display:grid;grid-template-columns:1.05fr .95fr;border-top:1px solid #334155}.terminal,.evidence{padding:22px 28px;position:relative}.terminal{border-right:1px solid #334155;font:18px/1.55 Consolas,monospace}.prompt{color:#4ade80}.command{color:#f8fafc}.log{margin-top:16px;color:#cbd5e1}.ok{color:#86efac}.evidence h3{margin:0 0 16px;font-size:19px;color:#93c5fd}.result{font-size:22px;line-height:1.35;color:#f8fafc}.anchor{margin-top:20px;color:#fbbf24;font-size:16px}
  .progress{position:absolute;left:0;bottom:0;height:6px;background:#22c55e;width:0}.cursor{position:absolute;width:22px;height:22px;border:3px solid #f8fafc;border-radius:50%;box-shadow:0 0 0 6px #38bdf844;transition:all .25s;z-index:10}
  </style></head><body><header><div class="brand">SAAS AUTOPILOT</div><div class="title">${escapeHtml(scene.title)}</div><div class="pilot">REAL PIPELINE PILOT</div></header>
  <main><aside><div class="label">ACTION - FOLLOW ONE STEP</div>${steps}</aside><section class="editor"><div class="tabs">FOCUS: ${escapeHtml(scene.source_file)}</div><div id="code" class="code">${code}</div><div id="cursor" class="cursor"></div></section>
  <section class="bottom"><div class="terminal"><div class="label">INPUT</div><div><span class="prompt">Enter:</span> <span id="command" class="command"></span></div><div id="log" class="log"></div></div><div class="evidence"><h3>RESULT - CHECK THIS BEFORE CONTINUING</h3><div id="result" class="result"></div><div id="anchor" class="anchor"></div><div id="progress" class="progress"></div></div></section></main>
  <script>
  const duration=${duration}; const outputs=${JSON.stringify(outputs)}; const commands=${JSON.stringify(commands)}; const anchors=${JSON.stringify(scene.demo_steps.map(s => escapeHtml(s.visual_anchor)))};
  const code=document.getElementById('code'), lines=[...document.querySelectorAll('.line')], steps=[...document.querySelectorAll('.step')];
  window.renderAt=(t)=>{const ratio=Math.min(1,t/duration), phase=Math.min(steps.length-1,Math.floor(ratio*steps.length)); steps.forEach((s,i)=>s.classList.toggle('active',i===phase));
  lines.forEach(l=>l.classList.remove('active')); const lineIndex=Math.min(lines.length-1,Math.floor(ratio*Math.max(1,lines.length-1))); if(lines[lineIndex]){lines[lineIndex].classList.add('active');code.scrollTop=Math.max(0,lineIndex*28-250)}
  document.getElementById('command').textContent=commands[phase]||''; document.getElementById('log').innerHTML='<span class="ok">PASS</span> '+outputs[phase]+'<br>Evidence captured at '+Math.floor(t)+' seconds'; document.getElementById('result').textContent=outputs[phase]||'';document.getElementById('anchor').textContent=anchors[phase]||'';document.getElementById('progress').style.width=(ratio*100)+'%';
  const c=document.getElementById('cursor');c.style.left=(430+((t*37)%900))+'px';c.style.top=(120+((t*23)%430))+'px';}; window.renderAt(0);
  </script></body></html>`;
}

async function captureScene(chromium, scene) {
  const audio = path.join(ASSET_DIR, `scene_${scene.scene_number}_audio.mp3`);
  const output = path.join(ASSET_DIR, `scene_${scene.scene_number}_recording.mp4`);
  if (!FORCE_SCENES.has(Number(scene.scene_number)) && fs.existsSync(output) && fs.statSync(output).size > 100000) {
    console.log(`Scene ${scene.scene_number}: existing recording retained.`);
    return;
  }
  const duration = Math.ceil(mediaDuration(audio)) + 2;
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--disable-gpu', '--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.setContent(pageHtml(scene, duration), { waitUntil: 'load' });
  const ffmpeg = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', `1/${FRAME_HOLD_SECONDS}`, '-i', '-', '-vf', 'scale=1920:1080:flags=lanczos,fps=24,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-t', String(duration), '-movflags', '+faststart', output, '-y'], { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
  for (let second = 0; second < duration; second += FRAME_HOLD_SECONDS) {
    await page.evaluate(t => window.renderAt(t), second);
    const frame = await page.screenshot({ type: 'jpeg', quality: 82 });
    if (!ffmpeg.stdin.write(frame)) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
  }
  ffmpeg.stdin.end();
  await new Promise((resolve, reject) => ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  await browser.close();
  console.log(`Scene ${scene.scene_number}: ${duration}s -> ${output}`);
}

async function main() {
  process.env.NODE_PATH = `${NODE_MODULES};${path.join(NODE_MODULES, '.pnpm', 'node_modules')}`;
  require('module').Module._initPaths();
  const { chromium } = require('playwright');
  const script = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf8'));
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  for (const scene of script.scenes) await captureScene(chromium, scene);
}

main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
