@echo off
setlocal
cd /d "%~dp0"

echo Ensuring MPV runtime binaries...
call "%~dp0scripts\windows\ensure_mpv_windows.bat"
if errorlevel 1 (
  echo.
  echo MPV setup failed. See messages above.
  pause
  exit /b 1
)

cd /d "%~dp0app"
REM One-time setup + run for Tankoban Pro (Electron + detached Python/Qt player).
REM This build does NOT use the old embedded libmpv/native addon path.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  echo Install Node.js LTS and re-run this file.
  echo.
  pause
  exit /b 1
)

echo Installing dependencies...
call npm.cmd install
if errorlevel 1 (
  echo.
  echo npm install failed. See messages above.
  pause
  exit /b 1
)

echo.
echo Launching app...
echo.

call npm.cmd start
echo.
echo App exited (or failed to start). See messages above.
pause
endlocal
