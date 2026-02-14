@echo off
setlocal EnableDelayedExpansion

set "NON_INTERACTIVE=0"
if /I "%~1"=="--non-interactive" set "NON_INTERACTIVE=1"
if /I "%~1"=="--ci" set "NON_INTERACTIVE=1"
if /I "%TANKOBAN_NON_INTERACTIVE%"=="1" set "NON_INTERACTIVE=1"

REM BUILD92: Unified one-click bootstrap + dist pipeline
REM Installs Python/Qt deps, Node deps, builds player, and creates Electron dist output.

echo ========================================
echo Tankoban Pro One-Click Build Pipeline
echo ========================================
echo.

set "REPO_ROOT=%~dp0"
set "APP_DIR=%REPO_ROOT%app"

if not exist "%APP_DIR%\package.json" (
  echo ERROR: app\package.json not found.
  echo Expected app directory: "%APP_DIR%"
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

set "PYTHON_EXE="
set "PYTHON_ARGS="

echo [1/8] Checking Python runtime...
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
  echo.
  echo ERROR: Python was not found on PATH.
  echo Install Python 3.9+ from https://www.python.org/downloads/windows/
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

"%PYTHON_EXE%" %PYTHON_ARGS% -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)"
if errorlevel 1 (
  echo.
  echo ERROR: Unsupported Python version detected. Tankoban requires Python 3.9+.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo [2/8] Installing Qt player dependencies...
call "%REPO_ROOT%app\player_qt\install_windows.bat" --non-interactive
if errorlevel 1 (
  echo.
  echo ERROR: Qt player dependency setup failed.
  echo Remediation: Verify Python 3.9+, pip health, and internet access.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo [3/8] Checking Node.js + npm...
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Node.js is not installed or not in PATH.
  echo Install Node.js LTS from https://nodejs.org/
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: npm is not installed or not in PATH.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

cd /d "%APP_DIR%"
if errorlevel 1 (
  echo ERROR: Could not change to app directory.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo [4/8] Ensuring MPV runtime binaries...
call "%REPO_ROOT%scripts\windows\ensure_mpv_windows.bat"
if errorlevel 1 (
  echo.
  echo ERROR: MPV runtime setup failed.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo [5/8] Installing Node dependencies...
if exist package-lock.json (
  call npm ci
  if errorlevel 1 (
    echo npm ci failed; retrying with npm install...
    call npm install
    if errorlevel 1 (
      echo ERROR: npm dependency install failed.
      if "%NON_INTERACTIVE%"=="1" exit /b 1
      pause
      exit /b 1
    )
  )
) else (
  call npm install
  if errorlevel 1 (
    echo ERROR: npm dependency install failed.
    if "%NON_INTERACTIVE%"=="1" exit /b 1
    pause
    exit /b 1
  )
)

echo [6/8] Building TankobanPlayer.exe...
call npm run build:player
if errorlevel 1 (
  echo.
  echo ERROR: Player build failed.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo [7/8] Validating player build artifacts...
call npm run validate:player
if errorlevel 1 (
  echo.
  echo ERROR: Player validation failed.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo [8/8] Building Electron distributables...
call npm run dist
if errorlevel 1 (
  echo.
  echo ERROR: npm run dist failed.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)

echo.
echo ========================================
echo BUILD SUCCESSFUL
echo ========================================
echo Dist output: app\dist

echo.
if "%NON_INTERACTIVE%"=="1" exit /b 0
pause
exit /b 0
