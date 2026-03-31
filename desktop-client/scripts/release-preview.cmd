@echo off
setlocal

set SCRIPT_DIR=%~dp0
pushd "%SCRIPT_DIR%\..\.."

echo ========================================
echo Bottle Desktop Preview Release
echo ========================================
echo.
echo Running preview desktop release packaging...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File ".\desktop-client\scripts\release-preview.ps1"
set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE% EQU 0 (
  echo Preview release completed successfully.
  echo Output folders:
  echo   .\desktop-client\dist\
  echo   .\desktop-client\dist\release\
) else (
  echo Preview release failed with exit code %EXIT_CODE%.
)
echo.
pause

popd
exit /b %EXIT_CODE%
