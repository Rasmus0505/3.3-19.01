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
set "LOCAL_SITE_URL=http://127.0.0.1:%LOCAL_PORT%/"
set "LOCAL_READY_URL=http://127.0.0.1:%LOCAL_PORT%/health/ready"
set "LOCAL_HEALTH_URL=http://127.0.0.1:%LOCAL_PORT%/health"
set "LOCAL_BROWSER_WAIT_SECONDS=60"
set "LOCAL_AUTO_LOGIN_EMAIL=root@qq.com"
set "LOCAL_AUTO_LOGIN_PASSWORD=123123"
set "LOCAL_AUTO_LOGIN_HTML=%LOCAL_STATIC_DIR%\local-auto-login.html"

if not exist "%LOCAL_DATA_DIR%" mkdir "%LOCAL_DATA_DIR%"
if not exist "%LOCAL_TMP_DIR%" mkdir "%LOCAL_TMP_DIR%"

set "APP_ENV=development"
set "PORT=%LOCAL_PORT%"
set "APP_TIMEZONE=Asia/Shanghai"
set "PYTHONUNBUFFERED=1"
set "DATABASE_URL=sqlite:///%LOCAL_DB_PATH:\=/%"
set "JWT_SECRET=local-dev-secret"
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
    if /i "%%A"=="LESSON_DEFAULT_ASR_MODEL" if not defined LESSON_DEFAULT_ASR_MODEL set "LESSON_DEFAULT_ASR_MODEL=%%B"
    if /i "%%A"=="QWEN_FORCED_ALIGNER_MODEL_DIR" if not defined QWEN_FORCED_ALIGNER_MODEL_DIR set "QWEN_FORCED_ALIGNER_MODEL_DIR=%%B"
    if /i "%%A"=="QWEN_FORCED_ALIGNER_DEVICE" if not defined QWEN_FORCED_ALIGNER_DEVICE set "QWEN_FORCED_ALIGNER_DEVICE=%%B"
    if /i "%%A"=="STEPFUN_API_KEY" if not defined STEPFUN_API_KEY set "STEPFUN_API_KEY=%%B"
    if /i "%%A"=="STEPFUN_ASR_BASE_URL" if not defined STEPFUN_ASR_BASE_URL set "STEPFUN_ASR_BASE_URL=%%B"
    if /i "%%A"=="STEPFUN_ASR_LANGUAGE" if not defined STEPFUN_ASR_LANGUAGE set "STEPFUN_ASR_LANGUAGE=%%B"
    if /i "%%A"=="STEPFUN_ASR_ENABLE_ITN" if not defined STEPFUN_ASR_ENABLE_ITN set "STEPFUN_ASR_ENABLE_ITN=%%B"
    if /i "%%A"=="SENSEVOICE_MODEL_DIR" if not defined SENSEVOICE_MODEL_DIR set "SENSEVOICE_MODEL_DIR=%%B"
    if /i "%%A"=="APP_TENCENT_SOE_APP_ID" if not defined APP_TENCENT_SOE_APP_ID set "APP_TENCENT_SOE_APP_ID=%%B"
    if /i "%%A"=="APP_TENCENT_SECRET_ID" if not defined APP_TENCENT_SECRET_ID set "APP_TENCENT_SECRET_ID=%%B"
    if /i "%%A"=="APP_TENCENT_SECRET_KEY" if not defined APP_TENCENT_SECRET_KEY set "APP_TENCENT_SECRET_KEY=%%B"
  )
)

echo.
echo ============================================
echo  Bottle personal local site
echo  URL:      %LOCAL_SITE_URL%
echo  Database: %LOCAL_DB_PATH%
echo  Data dir: %LOCAL_DATA_DIR%
echo  Static:   %LOCAL_STATIC_DIR%
echo  Auto login: %LOCAL_AUTO_LOGIN_EMAIL%
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
echo Browser will open automatically after the site is ready.
echo Local auto login will be attempted for %LOCAL_AUTO_LOGIN_EMAIL%.
start "Bottle local browser wait" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$siteUrl='%LOCAL_SITE_URL%'; $readyUrl='%LOCAL_READY_URL%'; $healthUrl='%LOCAL_HEALTH_URL%'; $loginUrl='http://127.0.0.1:%LOCAL_PORT%/api/auth/login'; $autoLoginUrl='http://127.0.0.1:%LOCAL_PORT%/static/local-auto-login.html'; $autoLoginHtmlPath='%LOCAL_AUTO_LOGIN_HTML%'; $deadline=(Get-Date).AddSeconds(%LOCAL_BROWSER_WAIT_SECONDS%); $ready=$false; while((Get-Date) -lt $deadline){ try { $resp=Invoke-WebRequest -Uri $readyUrl -UseBasicParsing -TimeoutSec 3; if($resp.StatusCode -eq 200){ $ready=$true; break } } catch { try { $resp=Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3; if($resp.StatusCode -eq 200){ $ready=$true; break } } catch {} } Start-Sleep -Seconds 1 }; if(-not $ready){ Write-Host '[WARN] Local site did not become ready before browser wait timed out.'; exit 0 }; $payload = @{ email = '%LOCAL_AUTO_LOGIN_EMAIL%'; password = '%LOCAL_AUTO_LOGIN_PASSWORD%' } | ConvertTo-Json -Compress; try { $loginResp = Invoke-RestMethod -Uri $loginUrl -Method POST -ContentType 'application/json' -Body $payload -TimeoutSec 10; if($loginResp.ok -and $loginResp.access_token){ $html = @'<!doctype html><html lang=""zh-CN""><head><meta charset=""utf-8""><meta name=""viewport"" content=""width=device-width, initial-scale=1""><title>Local Auto Login</title></head><body><p>Signing in...</p><script>(function(){const auth=__AUTH_PAYLOAD__;localStorage.setItem('english_asr_access_token',String(auth.access_token||''));localStorage.setItem('english_asr_refresh_token',String(auth.refresh_token||''));if(auth.user&&auth.user.id!=null)localStorage.setItem('english_asr_user_id',String(auth.user.id));if(auth.user&&auth.user.email)localStorage.setItem('english_asr_user_email',String(auth.user.email));if(auth.user&&auth.user.username)localStorage.setItem('english_asr_user_username',String(auth.user.username));localStorage.setItem('english_asr_user_is_admin',auth.user&&auth.user.is_admin?'true':'false');if(auth.user&&auth.user.collins_level!=null)localStorage.setItem('BOTTLE_COLLINS_LEVEL',String(auth.user.collins_level));window.location.replace('/');})();</script></body></html>'@; $html = $html.Replace('__AUTH_PAYLOAD__', ($loginResp | ConvertTo-Json -Compress -Depth 8)); Set-Content -Path $autoLoginHtmlPath -Value $html -Encoding UTF8; Start-Process $autoLoginUrl; exit 0 } } catch { Write-Host ('[WARN] Local auto login failed: ' + $_.Exception.Message) }; Start-Process $siteUrl"
python -m uvicorn app.main:app --host 127.0.0.1 --port %LOCAL_PORT% --reload

endlocal
