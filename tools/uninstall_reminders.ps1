# 移除 BD 提醒
$times = @('11:30', '13:00', '13:30')
foreach ($t in $times) {
    $tag = $t.Replace(':', '')
    $name = "客户跟进-BD提醒-$tag"
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "  [已删除] $t"
}
