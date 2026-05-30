@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\update-remote.ps1"
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
    echo.
    pause
    exit /b %EXIT_CODE%
)

pause
