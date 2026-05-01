@echo off
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ============================================
echo  正在关闭已有服务（端口 18080）...
echo ============================================
for /f "tokens=5" %%a in ('netstat -ano ^| find ":18080 " ^| find "LISTENING"') do (
  taskkill /f /pid %%a >nul 2>nul
)
timeout /t 1 /nobreak >nul

echo ============================================
echo  正在打开本地网站...
echo  地址：http://127.0.0.1:18080
echo ============================================
echo.

if exist ".venv\Scripts\activate.bat" (
  call ".venv\Scripts\activate.bat"
)

call "%SCRIPT_DIR%start-local.bat"
