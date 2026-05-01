@echo off
setlocal EnableExtensions
chcp 65001 >nul

set SCRIPT_DIR=%~dp0
cd /d %SCRIPT_DIR%

echo This script is for frontend dev-server debugging only.
echo For the normal one-click local site, run start-local.bat.
echo.

echo Starting Backend on http://localhost:18080 ...
set LOCAL_DB_PATH=%SCRIPT_DIR%app.local.db
set LOCAL_DATA_DIR=%SCRIPT_DIR%.local-data
if not exist "%LOCAL_DATA_DIR%" mkdir "%LOCAL_DATA_DIR%"
if exist ".env.local" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.local") do (
    if /i "%%A"=="QWEN_FORCED_ALIGNER_MODEL_DIR" if not defined QWEN_FORCED_ALIGNER_MODEL_DIR set "QWEN_FORCED_ALIGNER_MODEL_DIR=%%B"
    if /i "%%A"=="QWEN_FORCED_ALIGNER_DEVICE" if not defined QWEN_FORCED_ALIGNER_DEVICE set "QWEN_FORCED_ALIGNER_DEVICE=%%B"
    if /i "%%A"=="DASHSCOPE_API_KEY" if not defined DASHSCOPE_API_KEY set "DASHSCOPE_API_KEY=%%B"
    if /i "%%A"=="MT_BASE_URL" if not defined MT_BASE_URL set "MT_BASE_URL=%%B"
    if /i "%%A"=="MT_MODEL" if not defined MT_MODEL set "MT_MODEL=%%B"
    if /i "%%A"=="STEPFUN_API_KEY" if not defined STEPFUN_API_KEY set "STEPFUN_API_KEY=%%B"
  )
)
start "Bottle-Backend" cmd /k "title Bottle Backend && cd /d %SCRIPT_DIR% && set PYTHONPATH=%SCRIPT_DIR% && set APP_ENV=development && set PORT=18080 && set DATABASE_URL=sqlite:///%LOCAL_DB_PATH:\=/% && set JWT_SECRET=local-dev-secret-change-before-sharing && set PERSISTENT_DATA_DIR=%LOCAL_DATA_DIR% && set QWEN_FORCED_ALIGNER_MODEL_DIR=%QWEN_FORCED_ALIGNER_MODEL_DIR% && set QWEN_FORCED_ALIGNER_DEVICE=%QWEN_FORCED_ALIGNER_DEVICE% && set DASHSCOPE_API_KEY=%DASHSCOPE_API_KEY% && set MT_BASE_URL=%MT_BASE_URL% && set MT_MODEL=%MT_MODEL% && set STEPFUN_API_KEY=%STEPFUN_API_KEY% && python -m alembic -c alembic.ini upgrade head && python -m uvicorn app.main:app --host 127.0.0.1 --port 18080 --reload"

timeout /t 3 /nobreak >nul

echo Starting Frontend on http://localhost:5173 ...
cd frontend
start "Bottle-Frontend" cmd /k "title Bottle Frontend && npm run dev"

cd /d %SCRIPT_DIR%
timeout /t 2 /nobreak >nul

echo Opening browser...
start http://localhost:5173

echo.
echo ============================================
echo  Done!
echo  Frontend: http://localhost:5173
echo  Backend:  http://localhost:18080
echo  Local DB: %LOCAL_DB_PATH%
echo ============================================
pause
endlocal
