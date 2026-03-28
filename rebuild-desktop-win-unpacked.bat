@echo off
setlocal

set "ROOT=%~dp0"

cd /d "%ROOT%" || (
  echo [ERROR] Repository root not found.
  pause
  exit /b 1
)

echo [INFO] Closing running Bottle desktop processes...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'SilentlyContinue';" ^
  "Get-Process -Name Bottle, BottleLocalHelper | Stop-Process -Force;" ^
  "exit 0"

echo [INFO] Rebuilding desktop win-unpacked bundle...
call npm --prefix desktop-client run package:win
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Desktop win-unpacked rebuild failed with exit code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)

echo.
echo [INFO] Rebuild complete.
echo [INFO] Launch with:
echo [INFO] %ROOT%desktop-client\dist\win-unpacked\Bottle.exe
pause
exit /b 0
