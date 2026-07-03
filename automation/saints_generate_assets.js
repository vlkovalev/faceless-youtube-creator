/** Saints local audio generator using bundled Piper. */
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const { SAINTS_ROOT } = require('./channel_paths');
const ROOT = SAINTS_ROOT; const id = process.argv[2]; if(!id) throw new Error('Usage: node automation/saints_generate_assets.js <id>');
const scriptPath = path.join(ROOT,'scripts',`saints_video_${id}_data.js`); const assetDir = path.join(ROOT,'assets',`saints_video_${id}_assets`);
const piperExe = path.join(__dirname,'piper_tts','piper','piper.exe'); const model = path.join(__dirname,'piper_tts','piper','voice.onnx');
function load(){ const raw=fs.readFileSync(scriptPath,'utf8').replace(/^\uFEFF/,''); const m=raw.match(new RegExp(`window\\.SAINTS_SCRIPTS\\[${id}\\]\\s*=\\s*(\\{[\\s\\S]+\\})\\s*;?\\s*$`)); if(!m) throw new Error(`Could not parse saints script ${id}`); return JSON.parse(m[1]); }
function clean(t){ return String(t||'').replace(/<[^>]*>?/gm,' ').replace(/\s+/g,' ').trim(); }
function main(){ if(!fs.existsSync(scriptPath)) throw new Error(`Missing script ${scriptPath}`); if(!fs.existsSync(piperExe)||!fs.existsSync(model)) throw new Error('Missing Piper executable or voice model.'); fs.mkdirSync(assetDir,{recursive:true}); const script=load(); console.log(`Generating Saints voiceover: ${script.video.title}`); script.scenes.forEach((scene,i)=>{ const n=i+1; const temp=path.join(assetDir,`temp_scene_${n}.txt`); const out=path.join(assetDir,`scene_${n}_audio.wav`); fs.writeFileSync(temp,clean(scene.voiceover),'utf8'); try{ console.log(`[Piper] Saints ${id} scene ${n}...`); execSync(`Get-Content "${temp}" | & "${piperExe}" --model "${model}" --output_file "${out}"`,{shell:'powershell.exe',stdio:'inherit',windowsHide:true}); } finally { if(fs.existsSync(temp)) fs.unlinkSync(temp); } }); }
main();
