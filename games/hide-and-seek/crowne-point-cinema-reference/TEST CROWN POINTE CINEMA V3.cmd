@echo off
cd /d "%~dp0"
where node >nul 2>nul
if not %errorlevel%==0 (
  echo Node.js is not installed.
  pause
  exit /b 1
)
node test-cinema-v3.js
pause
