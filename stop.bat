@echo off
chcp 65001 >nul
title NSMC-Assistant 停止服务

echo 正在停止所有服务...

:: 停止 Flask 后端
taskkill /F /IM python.exe >nul 2>&1
:: 停止 Vite / Node 前端
taskkill /F /IM node.exe >nul 2>&1

echo ✅ 已停止所有服务
timeout /t 2 /nobreak >nul
