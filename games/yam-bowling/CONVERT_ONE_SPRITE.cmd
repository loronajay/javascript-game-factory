@echo off
setlocal
cd /d "%~dp0"

if "%~1"=="" (
  echo Drag one corrected PNG sprite onto this file.
  echo.
  echo The matching WebP will be created or replaced beside the PNG.
  echo Source sheets named source.png are intentionally rejected.
  pause
  exit /b 2
)

python tools\convert_one_sprite.py "%~1" --replace
echo.
pause
