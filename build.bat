@echo off
title Morning Radio - Build Desktop App
cd /d "%~dp0"
cd desktop

echo ============================================
echo   Morning Radio - Build Windows App
echo   Output: desktop\release
echo ============================================
echo.

rem 1. Check Node.js / npm
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from: https://nodejs.org
    pause
    exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm not found.
    pause
    exit /b 1
)

rem 2. Install dependencies (skip if already installed)
if not exist node_modules (
    echo [1/3] Installing dependencies, first time may take minutes...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
) else (
    echo [1/3] node_modules exists, skip install
)

rem 3. Build Windows app (NSIS installer + portable exe)
echo [2/3] Building...
call npm run dist
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

rem 4. Show result
echo [3/3] Done!
echo.
echo Output files:
dir /b release\*.exe 2>nul
echo.
echo   - Installer:  release\Glimmer Setup 1.1.0.exe
echo   - Portable:   release\Glimmer 1.1.0.exe
echo.
echo Tips:
echo   - If electron download is slow, set mirror first:
echo     set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
echo   - Repack after code change: just run this bat again
echo.
pause
