@echo off
setlocal

set "ROOT=%~dp0"
set "FRONTEND_DIR=%ROOT%frontend"
set "LOCAL_RUNTIME_PORT=%BOTTLE_LOCAL_RUNTIME_PORT%"
if "%LOCAL_RUNTIME_PORT%"=="" set "LOCAL_RUNTIME_PORT=18080"
set "LOCAL_RUNTIME_BASE_URL=%BOTTLE_LOCAL_RUNTIME_BASE_URL%"
if "%LOCAL_RUNTIME_BASE_URL%"=="" set "LOCAL_RUNTIME_BASE_URL=http://127.0.0.1:%LOCAL_RUNTIME_PORT%"
set "CLOUD_API_BASE_URL=%BOTTLE_CLOUD_API_BASE_URL%"
if "%CLOUD_API_BASE_URL%"=="" set "CLOUD_API_BASE_URL=http://127.0.0.1:8080"

set "PYTHON_BIN=python"
if exist "%ROOT%.venv\Scripts\python.exe" set "PYTHON_BIN=%ROOT%.venv\Scripts\python.exe"

cd /d "%FRONTEND_DIR%" || (
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

echo [INFO] Starting local Bottle runtime at %LOCAL_RUNTIME_BASE_URL%
start "Bottle Local Runtime" cmd /k "cd /d "%ROOT%" && set "PYTHONUTF8=1" && set DESKTOP_BACKEND_ROOT=%ROOT% && "%PYTHON_BIN%" scripts\run_desktop_backend.py --host 127.0.0.1 --port %LOCAL_RUNTIME_PORT%"

set "VITE_API_BASE_URL=%CLOUD_API_BASE_URL%"
set "VITE_LOCAL_RUNTIME_BASE_URL=%LOCAL_RUNTIME_BASE_URL%"

echo [INFO] Cloud API base: %VITE_API_BASE_URL%
echo [INFO] Local runtime base: %VITE_LOCAL_RUNTIME_BASE_URL%
echo [INFO] Starting local website at http://localhost:4173
start "" "http://localhost:4173"
call npm run dev -- --host 0.0.0.0 --port 4173
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo [ERROR] Local website exited with code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)

endlocal
