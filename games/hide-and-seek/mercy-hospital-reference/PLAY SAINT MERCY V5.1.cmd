@echo off
setlocal
cd /d "%~dp0"
set "PORT=8765"
set "PAGE=saint-mercy-hospital-v5.1.html"
where py >nul 2>nul
if %errorlevel%==0 goto PY
where python >nul 2>nul
if %errorlevel%==0 goto PYTHON
echo Python was not found. Opening the HTML directly.
start "" "%PAGE%"
exit /b
:PY
start "Saint Mercy V5.1 Server" /min py -m http.server %PORT% --bind 127.0.0.1
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/%PAGE%"
exit /b
:PYTHON
start "Saint Mercy V5.1 Server" /min python -m http.server %PORT% --bind 127.0.0.1
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/%PAGE%"
exit /b
