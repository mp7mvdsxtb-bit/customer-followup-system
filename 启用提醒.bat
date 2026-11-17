@echo off
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
