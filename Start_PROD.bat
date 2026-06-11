@echo off
chcp 65001 >nul
echo ==========================================
echo  DIGITAL CROWN - PRODUCTION (Port 8000/5173)
echo ==========================================
echo.

:: Backend PROD (Port 8000)
start "Backend PROD - 8000" cmd /k "cd /d %~dp0 && venv\Scripts\activate && uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 4"

:: Attente pour que le backend démarre
timeout /t 3 /nobreak >nul

:: Frontend PROD (Port 5173)
start "Frontend PROD - 5173" cmd /k "cd /d %~dp0\frontend && npm run dev"

echo.
echo ✅ Démarrage PRODUCTION en cours...
echo 🔵 Backend : http://127.0.0.1:8000
echo 🟢 Frontend: http://localhost:5173
echo.
pause
