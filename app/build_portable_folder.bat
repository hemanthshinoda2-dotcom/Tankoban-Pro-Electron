@echo off
setlocal
cd /d "%~dp0"

REM Build a portable folder (no installer, no code signing).
REM This avoids the symlink privilege error seen with electron-builder on some Windows setups.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  echo Install Node.js LTS and re-run this file.
  echo.
  pause
  exit /b 1
)

echo Installing dependencies (if needed)...
call npm install
if errorlevel 1 (
  echo.
  echo npm install failed. See messages above.
  pause
  exit /b 1
)

echo.
echo Packaging to a portable folder...
call npm run pack:folder
if errorlevel 1 (
  echo.
  echo Packaging failed. See messages above.
  pause
  exit /b 1
)

echo.
echo Zipping the folder for easy sharing...
call npm run zip:folder
if errorlevel 1 (
  echo.
  echo Zip step failed (folder build likely succeeded).
  echo Check dist\ for the folder output.
  pause
  exit /b 1
)

echo.
echo Done.
echo - Portable folder: dist\Tankoban-win32-x64\
echo - Portable zip:    dist\Tankoban-win32-x64.zip
echo.
echo To run: open the folder and launch "Tankoban.exe"
echo.
pause
endlocal
