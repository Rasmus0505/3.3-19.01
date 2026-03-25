@echo off
chcp 65001 >nul

echo ==========================================
echo   Bottle Desktop Package Script
echo ==========================================
echo.

set DESKTOP_CLOUD_APP_URL=https://351636.preview.aliyun-zeabur.cn/app
set DESKTOP_CLOUD_API_BASE_URL=https://351636.preview.aliyun-zeabur.cn

if not exist "D:\3.3-19.01\desktop\package.json" (
    echo [ERROR] package.json not found.
    pause
    exit /b 1
)

if not exist "D:\3.3-19.01\desktop\node_modules" (
    echo [INFO] Installing node dependencies...
    cd /d "D:\3.3-19.01\desktop"
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
) else (
    cd /d "D:\3.3-19.01\desktop"
)

echo [STEP 1/2] Building frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

echo.
echo [STEP 2/2] Packaging Windows client...
call npm run package:win
if errorlevel 1 (
    echo [ERROR] Package failed.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   Done!
echo ==========================================
echo.
echo Output: D:\3.3-19.01\desktop\dist\
echo.
echo - win-unpacked\: Portable version (double-click Bottle.exe)
echo - Bottle-Setup-*.exe: Installer
echo.
echo Cloud target: https://351636.preview.aliyun-zeabur.cn
echo.
pause
