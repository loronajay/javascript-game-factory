@echo off
cd /d "%~dp0"
title Hide and Seek
echo Starting Hide and Seek...
echo.
call npm start
if errorlevel 1 (
  echo.
  echo The game could not start. Make sure Node.js is installed.
  pause
)
