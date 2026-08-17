@echo off
title Glimmer - One-click Start
cd /d "%~dp0"

echo ============================================
echo   Glimmer - One-click Start
echo   Web: http://127.0.0.1:8123
echo ============================================
echo.

rem 1. Find Node.js (system PATH first, fallback to built-in runtime)
set "NODE_CMD="
where node >nul 2>nul
if not errorlevel 1 (
    set "NODE_CMD=node"
    echo [1/4] Node.js found
) else (
    echo [1/4] node not in PATH, trying built-in runtime...
    if exist "C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\node.exe" (
        set "NODE_CMD=C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\node.exe"
    ) else (
        echo [ERROR] Node.js not found. Please install: https://nodejs.org
        pause
        exit /b 1
    )
)

rem 2. Check if port 8123 is already in use
netstat -ano | findstr ":8123" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo [2/4] Service already running on port 8123
    start "" http://127.0.0.1:8123
    echo [OK] Browser opened, no need to restart.
    echo.
    timeout /t 3 >nul
    exit /b 0
)
echo [2/4] Port 8123 is free, starting...

rem 3. Start server (separate minimized window; close it to stop)
echo [3/4] Starting server...
if "%NODE_CMD%"=="node" (
    start "Glimmer-Server" /min node server.js
) else (
    start "Glimmer-Server" /min "%NODE_CMD%" server.js
)

rem 4. Wait until ready, then open browser
echo [4/4] Waiting for server...
set /a tries=0
:waitloop
set /a tries+=1
if %tries% gtr 15 (
    echo [ERROR] Timeout. Check server.js errors or port conflicts.
    pause
    exit /b 1
)
curl -s -o nul --max-time 2 http://127.0.0.1:8123
if not errorlevel 1 goto ready
timeout /t 1 >nul
goto waitloop

:ready
start "" http://127.0.0.1:8123
echo.
echo ============================================
echo   Started! Browser opened: http://127.0.0.1:8123
echo   To stop: close the minimized Glimmer-Server window
echo ============================================
echo.
timeout /t 3 >nul
exit /b 0
