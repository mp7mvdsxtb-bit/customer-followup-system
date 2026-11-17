@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"
title 停止客户跟进系统
powershell -NoProfile -Command "$p = (Get-NetTCPConnection -LocalPort 8795 -State Listen -ErrorAction SilentlyContinue).OwningProcess; if ($p) { Stop-Process -Id $p -Force; Write-Host '已停止服务' } else { Write-Host '服务没在运行' }"
timeout /t 2 >nul
