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

:: 在新窗口中启动 Flask（窗口标题为 Flask Backend）
start "Flask Backend" /MIN cmd /c py app.py
echo   正在启动 Flask 后端...
echo   等待连接...

:: 等待后端就绪（最多等 8 秒）
set wait=0
:wait_loop
timeout /t 2 /nobreak >nul
set /a wait+=2

:: 尝试连接后端
>nul 2>&1 curl -s http://localhost:5000/api/login -X POST -H "Content-Type: application/json" -d "{\"username\":\"test\",\"password\":\"test\"}"
if %errorlevel% equ 0 (
    echo   ✅ Flask 后端已启动 (http://localhost:5000)
    goto flask_ok
)
if %wait% lss 8 goto wait_loop

:: 没连上但端口可能还活着
echo   ⚠ 后端可能还未就绪，继续启动前端...
:flask_ok

:: ───── 2. 启动 Vite 前端 ─────
echo [2/2] 启动 Vite 前端...
cd /d "%ROOT%frontend"

if not exist "node_modules" (
    echo   正在安装 npm 依赖...
    call npm install
)

:: 在新窗口中启动 Vite
start "Vite Frontend" /MIN cmd /c npm run dev

timeout /t 3 /nobreak >nul

echo   ✅ Vite 前端已启动 (http://localhost:5173)

echo.
echo ════════════════════════════════════════
echo     全部启动完毕！
echo.
echo     前端: http://localhost:5173
echo     后端: http://localhost:5000
echo.
echo     关闭本窗口 或 按任意键 停止服务
echo ════════════════════════════════════════
pause >nul

:: ───── 清理 ─────
echo.
echo 正在停止服务...
taskkill /F /FI "WINDOWTITLE eq Flask Backend" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Vite Frontend" >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo ✅ 已停止所有服务
timeout /t 2 /nobreak >nul
