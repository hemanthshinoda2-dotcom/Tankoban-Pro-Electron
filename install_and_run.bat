@echo off
setlocal
cd /d "%~dp0"
set "NON_INTERACTIVE=0"

if /I "%~1"=="--non-interactive" set "NON_INTERACTIVE=1"
if /I "%~1"=="--ci" set "NON_INTERACTIVE=1"
if /I "%TANKOBAN_NON_INTERACTIVE%"=="1" set "NON_INTERACTIVE=1"

set "PYTHON_EXE="
set "PYTHON_ARGS="

where py >nul 2>nul
if not errorlevel 1 (
  set "PYTHON_EXE=py"
  set "PYTHON_ARGS=-3"
) else (
  where python >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_EXE=python"
  )
)

if "%PYTHON_EXE%"=="" (
  echo Python was not found on PATH.
  echo Install Python 3.9+ from https://www.python.org/downloads/windows/
  echo and re-run this script.
  echo.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

"%PYTHON_EXE%" %PYTHON_ARGS% -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)"
if errorlevel 1 (
  echo Unsupported Python version detected.
  echo Tankoban requires Python 3.9 or newer.
  echo Upgrade Python and ensure py/python resolves to 3.9+.
  echo.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo Ensuring MPV runtime binaries...
call "%~dp0scripts\windows\ensure_mpv_windows.bat"
if errorlevel 1 (
  echo.
  echo MPV setup failed. See messages above.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo Installing Qt player dependencies...
if "%NON_INTERACTIVE%"=="1" (
  call "%~dp0app\player_qt\install_windows.bat" --non-interactive
) else (
  call "%~dp0app\player_qt\install_windows.bat"
)
if errorlevel 1 (
  echo.
  echo Qt player setup failed.
  echo Remediation: Verify Python 3.9+, internet access, and rerun install_and_run.bat.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
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
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo Installing dependencies...
call npm.cmd install
if errorlevel 1 (
  echo.
  echo npm install failed. See messages above.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

if "%NON_INTERACTIVE%"=="1" (
  echo.
  echo Non-interactive setup completed successfully. Skipping app launch.
  endlocal
  exit /b 0
)

echo.
echo Launching app...
echo.

call npm.cmd start
echo.
echo App exited (or failed to start). See messages above.
pause
endlocal
