$ErrorActionPreference = "Stop"
$node = "C:\Users\heliu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
Set-Location "C:\Users\heliu\Desktop\WebSItes\faceless-youtube-creator-clean"
"Started Saints rerender 13-20: $(Get-Date -Format o)" | Out-File -FilePath "scratch\saints_rerender_13_20.log" -Encoding utf8
foreach ($id in 13..20) {
  "`n===== Saints $id polish $(Get-Date -Format o) =====" | Tee-Object -FilePath "scratch\saints_rerender_13_20.log" -Append
  powershell -ExecutionPolicy Bypass -File "automation\saints_visual_polish_agent.ps1" $id 2>&1 | Tee-Object -FilePath "scratch\saints_rerender_13_20.log" -Append
  if ($LASTEXITCODE -ne 0) { throw "Polish failed for Saints $id" }
  "`n===== Saints $id render $(Get-Date -Format o) =====" | Tee-Object -FilePath "scratch\saints_rerender_13_20.log" -Append
  $renderOut = "scratch\saints_render_${id}.out.log"
  $renderErr = "scratch\saints_render_${id}.err.log"
  & cmd.exe /d /c "`"$node`" `"automation\saints_editor_agent.js`" $id > `"$renderOut`" 2> `"$renderErr`""
  $renderExit = $LASTEXITCODE
  Get-Content -Path $renderOut, $renderErr -ErrorAction SilentlyContinue | Add-Content -Path "scratch\saints_rerender_13_20.log"
  if ($renderExit -ne 0) { throw "Render failed for Saints $id" }
  "`n===== Saints $id QC $(Get-Date -Format o) =====" | Tee-Object -FilePath "scratch\saints_rerender_13_20.log" -Append
  $qcOut = "scratch\saints_qc_${id}.out.log"
  $qcErr = "scratch\saints_qc_${id}.err.log"
  $qcScript = "const qc=require('./automation/qc_agent'); const id=process.argv[1]; const r=qc.runQc('saints_'+id,{sourcePath:'The Saints/videos/saints_ready/SAINTS_VIDEO_'+id+'_FINAL.mp4',srtSourcePath:'The Saints/videos/saints_ready/SAINTS_VIDEO_'+id+'_FINAL.srt',thumbnailFilename:'saints_thumbnail_video_'+id+'.png'}); process.exit(r.qc_status==='failed'?1:0);"
  & cmd.exe /d /c "`"$node`" -e `"$qcScript`" $id > `"$qcOut`" 2> `"$qcErr`""
  $qcExit = $LASTEXITCODE
  Get-Content -Path $qcOut, $qcErr -ErrorAction SilentlyContinue | Add-Content -Path "scratch\saints_rerender_13_20.log"
  if ($qcExit -ne 0) { throw "QC failed for Saints $id" }
}
"Finished Saints rerender 13-20: $(Get-Date -Format o)" | Tee-Object -FilePath "scratch\saints_rerender_13_20.log" -Append
