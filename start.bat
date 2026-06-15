@echo off
chcp 65001 >nul
title NSMC-Assistant Startup

set ROOT=%~dp0
echo ========================================
echo   NSMC-Assistant  Startup
echo ========================================
echo.

:: ---- 1. Start Flask Backend ----
echo [1/2] Starting Flask backend...
cd /d "%ROOT%"

start "Flask-Backend" /MIN cmd /c py app.py

echo   Waiting for backend...

:: Health check loop (max 15s)
set WAIT=0
:check_backend
timeout /t 3 /nobreak >nul
set /a WAIT+=3

>nul 2>&1 curl -s http://localhost:5000/api/login -X POST -H "Content-Type: application/json" -d "{\"username\":\"test\",\"password\":\"test\"}"
if %errorlevel% equ 0 (
    echo   [OK] Flask backend is running on http://localhost:5000
    goto backend_ok
)
if %WAIT% lss 15 goto check_backend
echo   [WARN] Backend not confirmed yet, continuing...

:backend_ok

:: ---- 2. Start Vite Frontend ----
echo [2/2] Starting Vite frontend...
cd /d "%ROOT%frontend"

if not exist "node_modules" (
    echo   Installing npm dependencies...
    call npm install
)

start "Vite-Frontend" /MIN cmd /c npm run dev

echo   Waiting for frontend...
timeout /t 4 /nobreak >nul
echo   [OK] Frontend should be running on http://localhost:5173

echo.
echo ========================================
echo   All services started.
echo.
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:5000
echo.
echo   Press any key to stop all services.
echo ========================================
pause >nul

echo.
echo Stopping services...
taskkill /F /FI "WINDOWTITLE eq Flask-Backend" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Vite-Frontend" >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo [OK] All services stopped.
timeout /t 2 /nobreak >nul
