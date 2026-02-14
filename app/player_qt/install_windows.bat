@echo off
setlocal
set "NON_INTERACTIVE=0"

if /I "%~1"=="--non-interactive" set "NON_INTERACTIVE=1"
if /I "%TANKOBAN_NON_INTERACTIVE%"=="1" set "NON_INTERACTIVE=1"

REM Tankoban Qt Player installer (Pro V2)
REM Creates a venv and installs dependencies.

cd /d "%~dp0"

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
  echo ERROR: Python is not installed or not on PATH.
  echo Install Python 3.9+ from https://www.python.org/downloads/windows/
  echo and re-run install_and_run.bat.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

"%PYTHON_EXE%" %PYTHON_ARGS% -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)"
if errorlevel 1 (
  echo ERROR: Python 3.9 or newer is required for the Qt player.
  echo Upgrade Python and ensure the selected interpreter on PATH is 3.9+.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

if not exist .venv (
  "%PYTHON_EXE%" %PYTHON_ARGS% -m venv .venv
  if errorlevel 1 (
    echo ERROR: Failed to create player_qt\.venv.
    echo Remediation: Verify Python is healthy and rerun install_and_run.bat.
    if "%NON_INTERACTIVE%"=="1" exit /b 1
    pause
    exit /b 1
  )
)

call ".venv\Scripts\activate.bat"
if errorlevel 1 (
  echo ERROR: Failed to activate .venv\Scripts\activate.bat.
  echo Remediation: Delete app\player_qt\.venv and rerun install_and_run.bat.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

python -m pip install --upgrade pip
if errorlevel 1 (
  echo ERROR: pip upgrade failed for the Qt player environment.
  echo Remediation: Check network/proxy settings, then rerun install_and_run.bat.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

python -m pip install -r requirements.txt
if errorlevel 1 (
  echo ERROR: Qt player dependency install failed.
  echo Remediation: Ensure Visual C++ redistributables and internet access,
  echo then rerun install_and_run.bat.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo.
echo OK: Qt player dependencies installed.
echo.
if "%NON_INTERACTIVE%"=="1" exit /b 0
pause
