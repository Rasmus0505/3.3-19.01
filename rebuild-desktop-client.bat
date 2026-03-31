@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "SCRIPT_PATH=%SCRIPT_DIR%rebuild-desktop-client.ps1"

if not exist "%SCRIPT_PATH%" (
  echo [ERROR] Script not found:
  echo   %SCRIPT_PATH%
  echo.
  pause
  exit /b 1
)

"%POWERSHELL_EXE%" -NoLogo -ExecutionPolicy Bypass -File "%SCRIPT_PATH%"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo Desktop rebuild failed with exit code %EXIT_CODE%.
) else (
  echo Desktop rebuild finished. You can now open:
  echo   D:\3.3-19.01\desktop-client\dist-fixed\win-unpacked\Bottle.exe
)
echo.
pause
exit /b %EXIT_CODE%
