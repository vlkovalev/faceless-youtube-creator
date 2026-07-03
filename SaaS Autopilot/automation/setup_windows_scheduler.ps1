# setup_windows_scheduler.ps1
# Sets up Windows Task Scheduler to run SaaS Autopilot automated scripts hands-free.

$PowerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$WorkspaceDir = "c:\Users\heliu\Desktop\WebSItes\faceless-youtube-creator-clean"
$NodeLauncher = "$WorkspaceDir\SaaS Autopilot\automation\run_with_codex_node.ps1"
$SchedulerScript = "$WorkspaceDir\SaaS Autopilot\automation\saas_autopilot_channel_scheduler.js"
$CommentsScript = "$WorkspaceDir\SaaS Autopilot\automation\saas_autopilot_comments_agent.js"

Write-Host "⏳ Registering Windows Task Scheduler tasks..."

# 1. Register SaaS Autopilot Channel Scheduler (Runs hourly for continuous 24/7 backlog monitoring)
$SchedulerAction = New-ScheduledTaskAction -Execute $PowerShellPath -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$NodeLauncher`" `"$SchedulerScript`"" -WorkingDirectory $WorkspaceDir
$SchedulerTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$SchedulerSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "SaaS_Autopilot_Channel_Scheduler" -Action $SchedulerAction -Trigger $SchedulerTrigger -Settings $SchedulerSettings -Description "Runs every hour to automatically produce and schedule SaaS Autopilot YouTube episodes." -Force

# 2. Register SaaS Autopilot Comments Agent (Runs every 10 minutes for continuous 24/7 comment moderation)
$CommentsAction = New-ScheduledTaskAction -Execute $PowerShellPath -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$NodeLauncher`" `"$CommentsScript`" --auto" -WorkingDirectory $WorkspaceDir
$CommentsTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$CommentsSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "SaaS_Autopilot_Comments_Agent" -Action $CommentsAction -Trigger $CommentsTrigger -Settings $CommentsSettings -Description "Scrapes comments and posts AI replies every 10 minutes on autopilot." -Force

Write-Host "✅ Windows Task Scheduler tasks registered successfully!"
Write-Host "👉 'SaaS_Autopilot_Channel_Scheduler' set to run every 1 hour (24/7 continuous monitoring)."
Write-Host "👉 'SaaS_Autopilot_Comments_Agent' set to run every 10 minutes (24/7 real-time moderation)."
