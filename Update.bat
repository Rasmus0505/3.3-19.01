@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "SCRIPT_PATH=%SCRIPT_DIR%update-desktop-client.ps1"
set "TARGET_EXE=%SCRIPT_DIR%desktop-client\dist-fixed\win-unpacked\Bottle.exe"

if not exist "%SCRIPT_PATH%" (
  echo [ERROR] Desktop update script not found:
  echo   %SCRIPT_PATH%
  echo.
  pause
  exit /b 1
)

echo === Update Bottle Desktop Client ===
echo Workspace: %SCRIPT_DIR%
echo Target:    %TARGET_EXE%
echo.

"%POWERSHELL_EXE%" -NoLogo -ExecutionPolicy Bypass -File "%SCRIPT_PATH%"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo Desktop update failed with exit code %EXIT_CODE%.
) else (
  echo Desktop update finished.
  echo The latest client has been started from:
  echo   %TARGET_EXE%
)
echo.
pause
exit /b %EXIT_CODE%
