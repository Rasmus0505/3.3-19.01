@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

set "LOCAL_DB_PATH=%SCRIPT_DIR%app.local.db"
set "LOCAL_DATA_DIR=%SCRIPT_DIR%.local-data"
set "LOCAL_STATIC_DIR=%LOCAL_DATA_DIR%\static"
set "LOCAL_TMP_DIR=%LOCAL_DATA_DIR%\tmp"
set "LOCAL_PORT=18080"

if not exist "%LOCAL_DATA_DIR%" mkdir "%LOCAL_DATA_DIR%"
if not exist "%LOCAL_TMP_DIR%" mkdir "%LOCAL_TMP_DIR%"

set "APP_ENV=development"
set "PORT=%LOCAL_PORT%"
set "APP_TIMEZONE=Asia/Shanghai"
set "PYTHONUNBUFFERED=1"
set "DATABASE_URL=sqlite:///%LOCAL_DB_PATH:\=/%"
set "JWT_SECRET=local-dev-secret-change-before-sharing"
set "PERSISTENT_DATA_DIR=%LOCAL_DATA_DIR%"
set "APP_STATIC_DIR=%LOCAL_STATIC_DIR%"
set "TMP_WORK_DIR=%LOCAL_TMP_DIR%"
set "ASR_BUNDLE_ROOT_DIR=%LOCAL_DATA_DIR%\asr-models"
set "FASTER_WHISPER_MODEL_DIR=%LOCAL_DATA_DIR%\asr-models\faster-distil-small.en"
set "FASTER_WHISPER_PREFETCH_ON_START=0"

if exist ".env.local" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.local") do (
    if /i "%%A"=="DASHSCOPE_API_KEY" if not defined DASHSCOPE_API_KEY set "DASHSCOPE_API_KEY=%%B"
    if /i "%%A"=="MT_BASE_URL" if not defined MT_BASE_URL set "MT_BASE_URL=%%B"
    if /i "%%A"=="MT_MODEL" if not defined MT_MODEL set "MT_MODEL=%%B"
    if /i "%%A"=="QWEN_VISION_BASE_URL" if not defined QWEN_VISION_BASE_URL set "QWEN_VISION_BASE_URL=%%B"
    if /i "%%A"=="QWEN_VISION_MODEL" if not defined QWEN_VISION_MODEL set "QWEN_VISION_MODEL=%%B"
    if /i "%%A"=="APP_TIMEZONE" if not defined APP_TIMEZONE set "APP_TIMEZONE=%%B"
    if /i "%%A"=="PYTHONUNBUFFERED" if not defined PYTHONUNBUFFERED set "PYTHONUNBUFFERED=%%B"
    if /i "%%A"=="LESSON_DEFAULT_ASR_MODEL" if not defined LESSON_DEFAULT_ASR_MODEL set "LESSON_DEFAULT_ASR_MODEL=%%B"
    if /i "%%A"=="STEPFUN_API_KEY" if not defined STEPFUN_API_KEY set "STEPFUN_API_KEY=%%B"
    if /i "%%A"=="STEP_API_KEY" if not defined STEP_API_KEY set "STEP_API_KEY=%%B"
    if /i "%%A"=="STEPFUN_ASR_BASE_URL" if not defined STEPFUN_ASR_BASE_URL set "STEPFUN_ASR_BASE_URL=%%B"
    if /i "%%A"=="STEPFUN_ASR_LANGUAGE" if not defined STEPFUN_ASR_LANGUAGE set "STEPFUN_ASR_LANGUAGE=%%B"
    if /i "%%A"=="STEPFUN_ASR_ENABLE_ITN" if not defined STEPFUN_ASR_ENABLE_ITN set "STEPFUN_ASR_ENABLE_ITN=%%B"
    if /i "%%A"=="SENSEVOICE_MODEL_DIR" if not defined SENSEVOICE_MODEL_DIR set "SENSEVOICE_MODEL_DIR=%%B"
    if /i "%%A"=="APP_TENCENT_SOE_APP_ID" if not defined APP_TENCENT_SOE_APP_ID set "APP_TENCENT_SOE_APP_ID=%%B"
    if /i "%%A"=="APP_TENCENT_SECRET_ID" if not defined APP_TENCENT_SECRET_ID set "APP_TENCENT_SECRET_ID=%%B"
    if /i "%%A"=="APP_TENCENT_SECRET_KEY" if not defined APP_TENCENT_SECRET_KEY set "APP_TENCENT_SECRET_KEY=%%B"
    if /i "%%A"=="TENCENT_SOE_APP_ID" if not defined TENCENT_SOE_APP_ID set "TENCENT_SOE_APP_ID=%%B"
    if /i "%%A"=="TENCENT_SECRET_ID" if not defined TENCENT_SECRET_ID set "TENCENT_SECRET_ID=%%B"
    if /i "%%A"=="TENCENT_SECRET_KEY" if not defined TENCENT_SECRET_KEY set "TENCENT_SECRET_KEY=%%B"
  )
)

echo.
echo ============================================
echo  Bottle local site
echo  URL:      http://127.0.0.1:%LOCAL_PORT%
echo  Database: %LOCAL_DB_PATH%
echo  Data dir: %LOCAL_DATA_DIR%
echo  Static:   %LOCAL_STATIC_DIR%
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found on PATH.
  echo Install Python, create/activate .venv, then run this script again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found on PATH.
  echo Install Node.js, then run this script again.
  pause
  exit /b 1
)

if not exist "frontend\node_modules" (
  echo [ERROR] frontend\node_modules was not found.
  echo Run: npm --prefix frontend install
  pause
  exit /b 1
)

echo [1/3] Building frontend static files...
call npm --prefix frontend run build:app-static
if errorlevel 1 (
  echo [ERROR] Frontend build failed.
  pause
  exit /b 1
)

echo.
echo [2/3] Applying local SQLite migrations...
python -m alembic -c alembic.ini upgrade head
if errorlevel 1 (
  echo [ERROR] Database migration failed.
  pause
  exit /b 1
)

echo.
echo [3/3] Starting local site...
start "" "http://127.0.0.1:%LOCAL_PORT%"
python -m uvicorn app.main:app --host 127.0.0.1 --port %LOCAL_PORT%

endlocal
