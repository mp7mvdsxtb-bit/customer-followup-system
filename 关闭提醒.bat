@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"
title πÿ±’ BD Ã·–—
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\uninstall_reminders.ps1"
echo.
pause
