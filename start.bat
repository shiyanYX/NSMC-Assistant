@echo off
chcp 65001 >nul
title NSMC-Assistant 启动脚本

echo ════════════════════════════════════════
echo     川北医助手 - NSMC Assistant
echo     启动开发环境
echo ════════════════════════════════════════
echo.

set ROOT=%~dp0

:: ───── 1. 启动 Flask 后端 ─────
echo [1/2] 启动 Flask 后端...
cd /d "%ROOT%"

:: 在后台启动 Flask（隐藏窗口）
start /B py app.py > flask_output.log 2>&1
echo   等待后端启动（5 秒）...
timeout /t 5 /nobreak >nul

:: 检查后端是否输出成功
findstr /C:"启动Flask应用" flask_output.log >nul
if %errorlevel% equ 0 (
    echo   ✅ Flask 后端 (http://localhost:5000)
) else (
    type flask_output.log
)

:: ───── 2. 启动 Vite 前端 ─────
echo [2/2] 启动 Vite 前端...
cd /d "%ROOT%frontend"

if not exist "node_modules" (
    echo   安装 npm 依赖...
    call npm install
)

start /B npm run dev > vite_output.log 2>&1
timeout /t 3 /nobreak >nul

findstr /C:"Local:" vite_output.log >nul
if %errorlevel% equ 0 (
    echo   ✅ Vite 前端 (http://localhost:5173)
) else (
    type vite_output.log
)

echo.
echo ════════════════════════════════════════
echo     启动完成！
echo.
echo     前端: http://localhost:5173
echo     后端: http://localhost:5000
echo.
echo     按任意键关闭本窗口并停止服务
echo ════════════════════════════════════════
pause >nul

:: ───── 清理 ─────
echo 正在停止服务...
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo 已停止所有服务
timeout /t 2 /nobreak >nul
