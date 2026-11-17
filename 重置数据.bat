@echo off
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
