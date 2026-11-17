# 注册 BD 提醒（周二至周五 11:30 / 13:00 / 13:30）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vbs = Join-Path $root 'tools\remind_hidden.vbs'
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'

if (-not (Test-Path $vbs)) {
    Write-Host "  [错误] 找不到 $vbs"
    exit 1
}

$times = @('11:30', '13:00', '13:30')
foreach ($t in $times) {
    $tag = $t.Replace(':', '')
    $name = "客户跟进-BD提醒-$tag"
    $hh, $mm = $t.Split(':')
    $at = (Get-Date).Date.AddHours([int]$hh).AddMinutes([int]$mm)
    $action = New-ScheduledTaskAction -Execute $wscript -Argument ('"' + $vbs + '"')
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Tuesday, Wednesday, Thursday, Friday -At $at
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
    Write-Host "  [完成] $t"
}

Write-Host ""
Write-Host "已注册 3 个提醒。想立刻测一次，执行："
Write-Host '  schtasks /Run /TN "客户跟进-BD提醒-1130"'
