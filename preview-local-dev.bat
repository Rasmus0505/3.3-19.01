@echo off
chcp 65001 >nul

set SCRIPT_DIR=%~dp0
cd /d %SCRIPT_DIR%

echo Starting Backend on http://localhost:18080 ...
set PYTHON_PATH=%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe
start "Bottle-Backend" cmd /k "title Bottle Backend && cd /d %SCRIPT_DIR% && set PYTHONPATH=%SCRIPT_DIR% && set APP_ENV=development && set PORT=18080 && set DATABASE_URL=postgresql://root:QHcfk10XdZ7MwWFP82ipnm3VO469r5bY@47.108.142.28:30835/zeabur && set JWT_SECRET=dev-secret && set DASHSCOPE_API_KEY=sk-7de9fe2fdc9d4241a0c445a7d48165a2 && \"%PYTHON_PATH%\" -m uvicorn app.main:app --host 0.0.0.0 --port 18080 --reload"

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
echo ============================================
pause
