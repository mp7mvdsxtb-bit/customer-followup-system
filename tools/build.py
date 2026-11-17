# -*- coding: utf-8 -*-
"""生成 Windows 交付文件：.bat 必须 GBK+CRLF，.ps1 必须 UTF-8+BOM。

本文件的源码用 UTF-8 存，输出时按目标编码写字，避免 cmd/PowerShell 读错编码。
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

START_BAT = r"""@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"
title 客户跟进系统

if not exist "runtime\python.exe" (
  echo.
  echo   [错误] 缺少内嵌运行时 runtime\python.exe
  echo   请解压完整压缩包，不要只拷 start.bat 出来。
  echo.
  pause
  exit /b 1
)

echo ==========================================
echo   客户跟进系统
echo   浏览器会自动打开，关闭本窗口即停止
echo ==========================================
echo.

runtime\python.exe app\server.py
echo.
echo 服务已停止。
pause
"""

STOP_BAT = r"""@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"
title 停止客户跟进系统
powershell -NoProfile -Command "$p = (Get-NetTCPConnection -LocalPort 8795 -State Listen -ErrorAction SilentlyContinue).OwningProcess; if ($p) { Stop-Process -Id $p -Force; Write-Host '已停止服务' } else { Write-Host '服务没在运行' }"
timeout /t 2 >nul
"""

REMIND_BAT = r"""@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"
title 启用 BD 提醒

echo 将注册 3 个提醒：周二至周五 11:30、13:00、13:30
echo 到点会弹窗，点「打开工作台」即可开始。
echo.
set /p OK=确认注册？(Y/N):
if /i not "%OK%"=="Y" goto :eof

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install_reminders.ps1"
echo.
echo 已注册。取消提醒请运行「关闭提醒.bat」。
pause
"""

UNREMIND_BAT = r"""@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"
title 关闭 BD 提醒
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\uninstall_reminders.ps1"
echo.
pause
"""

RESET_BAT = r"""@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"
title 重置数据
echo 这会删除当前全部客户与跟进记录，恢复成 seed.xlsx 的初始状态。
echo 手动记的跟进也会一起没掉，请先导出 CSV 备份。
echo.
set /p OK=确认重置？(Y/N):
if /i not "%OK%"=="Y" goto :eof

taskkill /f /im python.exe /fi "WINDOWTITLE eq 客户跟进系统*" >nul 2>&1
del /q "data\crm.db" 2>nul
del /q "data\crm.db-wal" 2>nul
del /q "data\crm.db-shm" 2>nul
echo.
echo 已重置。下次双击 start.bat 会自动重建并重新导入。
pause
"""

REMIND_HIDDEN_VBS = r''' ' hidden launcher: runs remind.ps1 without a console window
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & here & "\remind.ps1""", 0, False
'''

REMIND_PS1 = r'''# BD 提醒：确保服务在跑，然后弹一个置顶小窗
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$port = 8795
$base = "http://127.0.0.1:$port/"

function Test-Up {
    try {
        $r = Invoke-WebRequest -Uri ($base + "api/today") -TimeoutSec 2 -UseBasicParsing
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

if (-not (Test-Up)) {
    Start-Process -FilePath (Join-Path $root "runtime\python.exe") `
        -ArgumentList "app\server.py" -WorkingDirectory $root -WindowStyle Hidden
    for ($i = 0; $i -lt 12; $i++) {
        Start-Sleep -Milliseconds 700
        if (Test-Up) { break }
    }
}

$n = 0; $mins = 60; $due = 0
try {
    $d = Invoke-RestMethod -Uri ($base + "api/today")
    $n = @($d.items).Count
    $mins = $d.planned_minutes
    $due = $d.due_count
} catch {}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "该做 BD 了"
$form.Size = New-Object System.Drawing.Size(430, 250)
$form.StartPosition = "CenterScreen"
$form.TopMost = $true
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(250, 251, 253)

$t1 = New-Object System.Windows.Forms.Label
$t1.Text = "今天的 BD 时间到了"
$t1.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 16, [System.Drawing.FontStyle]::Bold)
$t1.ForeColor = [System.Drawing.Color]::FromArgb(17, 24, 39)
$t1.SetBounds(26, 24, 380, 34)
$form.Controls.Add($t1)

$t2 = New-Object System.Windows.Forms.Label
$t2.Text = "队列里排了 $n 家，预计 $mins 分钟。其中到期/逾期 $due 家。"
$t2.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10)
$t2.ForeColor = [System.Drawing.Color]::FromArgb(75, 85, 99)
$t2.SetBounds(27, 68, 380, 26)
$form.Controls.Add($t2)

$t3 = New-Object System.Windows.Forms.Label
$t3.Text = "今天只有这一小时，先打最重要的人。"
$t3.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$t3.ForeColor = [System.Drawing.Color]::FromArgb(140, 148, 160)
$t3.SetBounds(27, 96, 380, 24)
$form.Controls.Add($t3)

$go = New-Object System.Windows.Forms.Button
$go.Text = "打开工作台"
$go.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10)
$go.SetBounds(27, 140, 168, 42)
$go.BackColor = [System.Drawing.Color]::FromArgb(47, 107, 255)
$go.ForeColor = [System.Drawing.Color]::White
$go.FlatStyle = "Flat"
$go.FlatAppearance.BorderSize = 0
$go.Add_Click({ Start-Process $base; $form.Close() })
$form.Controls.Add($go)

$later = New-Object System.Windows.Forms.Button
$later.Text = "稍后提醒"
$later.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10)
$later.SetBounds(207, 140, 168, 42)
$later.FlatStyle = "Flat"
$later.Add_Click({ $form.Close() })
$form.Controls.Add($later)

$form.AcceptButton = $go
$form.Add_Shown({ $form.Activate(); [System.Media.SystemSounds]::Exclamation.Play() })
[void]$form.ShowDialog()
'''

INSTALL_PS1 = r'''# 注册 BD 提醒（周二至周五 11:30 / 13:00 / 13:30）
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
'''

UNINSTALL_PS1 = r'''# 移除 BD 提醒
$times = @('11:30', '13:00', '13:30')
foreach ($t in $times) {
    $tag = $t.Replace(':', '')
    $name = "客户跟进-BD提醒-$tag"
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "  [已删除] $t"
}
'''

README = """客户跟进系统 · 使用说明
========================================

一、怎么打开
  双击「start.bat」。浏览器会自动打开 http://127.0.0.1:8795
  关闭那个黑色命令行窗口 = 停止服务。数据不会丢。
  浏览器没自动弹出就手动打开 http://127.0.0.1:8795。

二、每天怎么用（11:30 和 13:00 的提醒）
  1. 到点会弹窗，点「打开工作台」。
  2. 首页「今日工作台」已经按优先级排好队：
       必做     —— 到期或已逾期，排最前
       建议加做 —— 没排期、很久没联系的，按 KA → 有三方背调 → 其他
  3. 每张卡片：拨打 / 复制号码 → 打完点「记一笔」。
  4. 记一笔选一个结果（未接、答应加微、已加微信、已发资料、有兴趣…），
     系统自动推进阶段，并按结果给出下次跟进日（可改）。
  5. 对方明确没需求，勾「标记为不再跟进」，它从此不占你的队列。

三、七个页面
  今日工作台  —— 今天这一个小时打谁
  看板        —— 按阶段铺开，可拖动卡片改阶段
  客户库      —— 全量搜索筛选；勾选后可批量改阶段 / 排下次 / 停跟 / 删除
  数据洞察    —— 阶段漏斗、行业规模地区分布、近四周跟进量
  目标        —— 月度目标与保底、达成进度，自己填实际金额
  数据质量    —— 缺手机号 / 缺行业 / 缺规模 / 三方未知 / 逾期 / 从未跟进，
                 每项都能点「去处理」直接筛出那批客户；下面列出疑似重复公司
  设置        —— 每日时长、提醒时间、主题、备份

四、快捷操作
  Ctrl+K         命令面板，搜公司 / 联系人 / 手机号，或直接执行命令
  G 然后 T/B/C   跳到今日 / 看板 / 客户
  N              新建客户
  ?              快捷键说明
  记一笔弹窗里 Ctrl + Enter 直接保存

五、数据在哪
  data\\crm.db         —— 全部数据，拷走这个文件等于备份
  data\\seed.xlsx      —— 原始导入表
  data\\backups\\       —— 设置页点「备份数据库」生成的时间点快照
  设置页可导出 CSV，用 Excel 打开。

  注意：重新导入会覆盖手动记录。日常以系统为准，CSV 才是交接材料。

六、提醒设置
  设置页点「注册系统提醒」，或直接运行「启用提醒.bat」。
  默认注册周二至周五 11:30 / 13:00 / 13:30 三个任务。
  不想用了运行「关闭提醒.bat」。

七、发给别人 / 换电脑
  整个文件夹拷走（含 runtime 子目录）即可，对方双击 start.bat 就能用，
  不需要装 Python 或任何依赖。
  想要一份空库：运行「重置数据.bat」，或先删 data\\crm.db 再启动。

八、出问题
  · 双击后窗口一闪而过：runtime 被删了或解压不完整，重新解压整个压缩包。
  · 端口被占：会自动换到 8796、8797…，看黑窗口里打印的地址。
  · 杀毒软件拦 runtime\\python.exe：这是 Python 官方 embeddable 运行时
    （来源 python.org），放行即可。
  · 页面样式不对：按 Ctrl+F5 强制刷新一次。
"""


def write_gbk(name, text):
    path = os.path.join(ROOT, name)
    with open(path, "w", encoding="gbk", newline="\r\n") as f:
        f.write(text)
    return path


def write_utf8_bom(name, text):
    path = os.path.join(ROOT, name)
    with open(path, "w", encoding="utf-8-sig", newline="\r\n") as f:
        f.write(text)
    return path


def write_ascii(name, text):
    path = os.path.join(ROOT, name)
    with open(path, "w", encoding="ascii", newline="\r\n") as f:
        f.write(text)
    return path


def main():
    files = [
        ("start.bat", START_BAT, "gbk"),
        ("停止服务.bat", STOP_BAT, "gbk"),
        ("启用提醒.bat", REMIND_BAT, "gbk"),
        ("关闭提醒.bat", UNREMIND_BAT, "gbk"),
        ("重置数据.bat", RESET_BAT, "gbk"),
        ("使用说明.txt", README, "gbk"),
    ]
    for name, text, enc in files:
        write_gbk(name, text)
        print("写", name)
    write_ascii("tools/remind_hidden.vbs", REMIND_HIDDEN_VBS)
    print("写 tools/remind_hidden.vbs")
    write_utf8_bom("tools/remind.ps1", REMIND_PS1)
    print("写 tools/remind.ps1")
    write_utf8_bom("tools/install_reminders.ps1", INSTALL_PS1)
    print("写 tools/install_reminders.ps1")
    write_utf8_bom("tools/uninstall_reminders.ps1", UNINSTALL_PS1)
    print("写 tools/uninstall_reminders.ps1")


if __name__ == "__main__":
    main()
