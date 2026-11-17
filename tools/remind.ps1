# BD 提醒：确保服务在跑，然后弹一个置顶小窗
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
