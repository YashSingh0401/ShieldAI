@echo off
echo Starting ShieldAI...

start "Backend" cmd /k "cd /d C:\Users\ShieldAI\backend && uvicorn app.main:app --host 127.0.0.1 --port 8000"
timeout /t 2 /nobreak >nul
start "Frontend" cmd /k "cd /d C:\Users\ShieldAI\frontend && npm run dev"

echo Both servers started in separate windows.
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:5173
echo Close the windows to stop the servers.
