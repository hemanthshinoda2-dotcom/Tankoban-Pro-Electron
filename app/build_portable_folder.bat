@echo off
setlocal
cd /d "%~dp0"

set "NON_INTERACTIVE=0"
if /I "%~1"=="--non-interactive" set "NON_INTERACTIVE=1"
if /I "%~1"=="--ci" set "NON_INTERACTIVE=1"
if /I "%TANKOBAN_NON_INTERACTIVE%"=="1" set "NON_INTERACTIVE=1"

REM Build a portable folder (no installer, no code signing).
REM Includes full release prep so packaged output contains validated player artifacts.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  echo Install Node.js LTS and re-run this file.
  echo.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not available on PATH.
  echo Reinstall Node.js LTS and re-run this file.
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

echo Installing dependencies...
if exist package-lock.json (
  call npm.cmd ci
  if errorlevel 1 (
    echo npm ci failed, falling back to npm install...
    call npm.cmd install
  )
) else (
  call npm.cmd install
)
if errorlevel 1 (
  echo.
  echo Dependency installation failed. See messages above.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo.
echo Preparing release artifacts...
call npm.cmd run release:prep
if errorlevel 1 (
  echo.
  echo Release prep failed. See messages above.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo.
echo Packaging to a portable folder...
call npm.cmd run pack:folder
if errorlevel 1 (
  echo.
  echo Packaging failed. See messages above.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo.
echo Zipping the folder for easy sharing...
call npm.cmd run zip:folder
if errorlevel 1 (
  echo.
  echo Zip step failed, but folder build may have succeeded.
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
if "%NON_INTERACTIVE%"=="1" (
  endlocal
  exit /b 0
)
pause
endlocal
