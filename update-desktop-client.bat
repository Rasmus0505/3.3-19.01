@echo off
setlocal enabledelayedexpansion

set "EXE_NAME=Bottle.exe"
set "EXE_PATH=%~dp0desktop-client\dist-fixed\win-unpacked\Bottle.exe"
set "UPDATE_SCRIPT=%~dp0desktop-client\scripts\update-win-unpacked.mjs"
set "FULL_REBUILD_CODE=20"

echo ========================================
echo   Bottle Desktop Client Update
echo ========================================
echo.

:: Check if Bottle.exe is currently running
echo [1/3] Checking if %EXE_NAME% is running...
wmic process where "name='%EXE_NAME%'" get ProcessId 2>nul | findstr /r "[0-9]" >nul
if %errorlevel% equ 0 (
    echo        Found running instance. Terminating...
    taskkill /f /im "%EXE_NAME%" >nul 2>&1
    :: Give it a moment to fully exit
    timeout /t 2 /nobreak >nul
    echo        Terminated.
) else (
    echo        Not running. Proceeding...
)
echo.

:: Run the actual update script
echo [2/3] Running update script...
echo.
node "%UPDATE_SCRIPT%"
set "UPDATE_EXIT=%errorlevel%"
echo.

:: Exit code 20 = full rebuild required (frontend not ready) — skip launch
if %UPDATE_EXIT% equ %FULL_REBUILD_CODE% (
    echo [x] Update skipped: full rebuild needed. Please run the full build first.
    echo.
    goto :end
)

:: Any other non-zero exit = failure
if %UPDATE_EXIT% neq 0 (
    echo [x] Update failed with exit code %UPDATE_EXIT%.
    echo.
    goto :end
)

:: Success — launch the app
echo [3/3] Update succeeded. Launching %EXE_NAME%...
start "" "%EXE_PATH%"
echo        Launched.

:end
echo.
echo ========================================
echo   Done.
echo ========================================
pause
