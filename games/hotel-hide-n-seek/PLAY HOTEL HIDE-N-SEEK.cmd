@echo off
cd /d "%~dp0"
title Hotel Hide-n-Seek
echo Starting Hotel Hide-n-Seek...
echo.
call npm start
if errorlevel 1 (
  echo.
  echo The game could not start. Make sure Node.js is installed.
  pause
)
