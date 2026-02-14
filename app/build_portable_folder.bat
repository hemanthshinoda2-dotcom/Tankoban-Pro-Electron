@echo off
setlocal
cd /d "%~dp0"

set "NON_INTERACTIVE=0"
if /I "%~1"=="--non-interactive" set "NON_INTERACTIVE=1"
if /I "%~1"=="--ci" set "NON_INTERACTIVE=1"
if /I "%TANKOBAN_NON_INTERACTIVE%"=="1" set "NON_INTERACTIVE=1"

REM Build a portable folder (no installer, no code signing).
REM This script now bootstraps all required dependencies before packaging.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  echo Install Node.js LTS and re-run this file.
  echo.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo Ensuring MPV runtime binaries...
call "..\scripts\windows\ensure_mpv_windows.bat"
if errorlevel 1 (
  echo.
  echo MPV setup failed. See messages above.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo Installing Qt player dependencies...
if "%NON_INTERACTIVE%"=="1" (
  call "player_qt\install_windows.bat" --non-interactive
) else (
  call "player_qt\install_windows.bat"
)
if errorlevel 1 (
  echo.
  echo Qt player setup failed.
  echo Remediation: Verify Python 3.9+, internet access, and rerun app\build_portable_folder.bat.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo Installing Node dependencies...
if exist package-lock.json (
  call npm ci
  if errorlevel 1 (
    echo npm ci failed; retrying with npm install...
    call npm install
    if errorlevel 1 (
      echo.
      echo npm dependency install failed. See messages above.
      if "%NON_INTERACTIVE%"=="1" exit /b 1
      pause
      exit /b 1
    )
  )
) else (
  call npm install
  if errorlevel 1 (
    echo.
    echo npm dependency install failed. See messages above.
    if "%NON_INTERACTIVE%"=="1" exit /b 1
    pause
    exit /b 1
  )
)

echo Building standalone Qt player...
call npm run build:player
if errorlevel 1 (
  echo.
  echo Player build failed. See messages above.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo Validating player artifacts...
call npm run validate:player
if errorlevel 1 (
  echo.
  echo Player validation failed. See messages above.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo.
echo Packaging to a portable folder...
call npm run pack:folder
if errorlevel 1 (
  echo.
  echo Packaging failed. See messages above.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
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
  if "%NON_INTERACTIVE%"=="1" exit /b 1
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
if "%NON_INTERACTIVE%"=="1" exit /b 0
pause
endlocal
