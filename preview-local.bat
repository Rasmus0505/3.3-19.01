@echo off
setlocal

REM One-click local preview for frontend production build
cd /d "%~dp0frontend" || (
  echo [ERROR] frontend directory not found.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [INFO] node_modules not found, installing dependencies...
  call npm ci || (
    echo [ERROR] npm ci failed.
    pause
    exit /b 1
  )
)

echo [INFO] Starting local preview at http://localhost:4173
start "" "http://localhost:4173"
call npm run preview:local
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo [ERROR] Local preview exited with code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)

endlocal
