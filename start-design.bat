@echo off
cd /d "%~dp0"
echo Stopping old server on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
echo Starting design mode...
npm run dev:design
pause
