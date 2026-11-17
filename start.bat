@echo off
chcp 936 >nul 2>&1
cd /d "%~dp0"
title 客户跟进系统 - 崔敏

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
