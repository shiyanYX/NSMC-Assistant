@echo off
chcp 65001 >nul
title NSMC-Assistant 停止服务

echo ════════════════════════════════════════
echo     川北医助手 - 停止服务
echo ════════════════════════════════════════
echo.
echo 正在停止所有服务...

:: 按窗口标题精确停止
taskkill /F /FI "WINDOWTITLE eq Flask Backend" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Vite Frontend" >nul 2>&1

:: 保险：按进程名停止
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1

echo ✅ 已停止所有服务
timeout /t 2 /nobreak >nul
