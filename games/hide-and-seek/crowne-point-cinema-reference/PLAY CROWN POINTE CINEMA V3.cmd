@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  start "Crown Pointe Cinema V3 Server" /min py "serve_crown_pointe_v3.py"
  exit /b 0
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "Crown Pointe Cinema V3 Server" /min python "serve_crown_pointe_v3.py"
  exit /b 0
)

echo Python was not found. Opening the HTML directly.
start "" "crown-pointe-cinema-v3.html"
