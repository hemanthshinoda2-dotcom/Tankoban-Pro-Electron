@echo off
setlocal EnableDelayedExpansion

set "NON_INTERACTIVE=0"
if /I "%~1"=="--non-interactive" set "NON_INTERACTIVE=1"
if /I "%~1"=="--ci" set "NON_INTERACTIVE=1"
if /I "%TANKOBAN_NON_INTERACTIVE%"=="1" set "NON_INTERACTIVE=1"

REM BUILD72: Robust Windows build script
REM - Always keeps console open on any failure
REM - Shows full error messages with context
REM - Handles common Windows edge cases
REM - Provides clear guidance on failures

echo ========================================
echo Tankoban Pro One-Click Build Pipeline
echo ========================================
echo.

REM BUILD91: Preflight Python + Qt player dependency bootstrap
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

if "!PYTHON_EXE!"=="" (
  echo.
  echo ERROR: Python was not found on PATH.
  echo Install Python 3.9+ from https://www.python.org/downloads/windows/
  echo and re-run this script.
  echo.
  if "!NON_INTERACTIVE!"=="1" exit /b 1
  echo Press any key to close...
  pause >nul
  exit /b 1
)

"!PYTHON_EXE!" !PYTHON_ARGS! -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)"
if errorlevel 1 (
  echo.
  echo ERROR: Unsupported Python version detected.
  echo Tankoban requires Python 3.9 or newer.
  echo Upgrade Python and ensure py/python resolves to 3.9+.
  echo.
  if "!NON_INTERACTIVE!"=="1" exit /b 1
  echo Press any key to close...
  pause >nul
  exit /b 1
)

echo [2/8] Installing Qt player dependencies...
if "!NON_INTERACTIVE!"=="1" (
  call "%~dp0app\player_qt\install_windows.bat" --non-interactive
) else (
  call "%~dp0app\player_qt\install_windows.bat"
)
if errorlevel 1 (
  echo.
  echo ERROR: Qt player dependency setup failed.
  echo.
  echo Remediation: Verify Python 3.9+, internet access, and rerun build_windows_exe.bat.
  if "!NON_INTERACTIVE!"=="1" exit /b 1
  echo Press any key to close...
  pause >nul
  exit /b 1
)
echo.

REM Change to app directory - critical first step
cd /d "%~dp0app" 2>nul
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

REM Check Node.js availability
echo [3/8] Checking Node.js...
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

REM Ensure mpv runtime files are present (not committed due GitHub 100MB limit)
echo [4/8] Ensuring MPV runtime binaries...
call "%~dp0scripts\windows\ensure_mpv_windows.bat"
if errorlevel 1 (
  echo.
  echo ERROR: MPV runtime setup failed.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  pause
  exit /b 1
)
echo.

REM Install dependencies
echo [5/8] Installing dependencies...

REM BUILD73: Retry logic for EBUSY errors (common on Windows with file locks)
set INSTALL_SUCCESS=0
set INSTALL_ATTEMPTS=0
set MAX_ATTEMPTS=3

:INSTALL_RETRY
set /a INSTALL_ATTEMPTS+=1
echo Attempt %INSTALL_ATTEMPTS% of %MAX_ATTEMPTS%...

REM Kill any stray Electron processes that might be holding file locks
REM Only target processes from this specific directory to avoid killing user's work
echo Checking for stray processes...
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq electron.exe" /FO CSV /NH 2^>nul') do (
  set "PID=%%~i"
  if not "!PID!"=="" (
    echo Found Electron process: !PID!
    taskkill /PID !PID! /F >nul 2>&1
  )
)

REM Small delay to let file handles release
timeout /t 2 /nobreak >nul 2>&1

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
  echo No package-lock.json found - using npm install...
  call npm install 2>&1
  if !errorlevel! equ 0 (
    set INSTALL_SUCCESS=1
    goto INSTALL_DONE
  )
  
  if %INSTALL_ATTEMPTS% lss %MAX_ATTEMPTS% (
    echo npm install failed. This may be a file lock issue. Retrying...
    timeout /t 3 /nobreak >nul 2>&1
    goto INSTALL_RETRY
  )
)

:INSTALL_DONE
if !INSTALL_SUCCESS! equ 0 (
  echo.
  echo ========================================
  echo DEPENDENCY INSTALLATION FAILED
  echo ========================================
  echo.
  echo After %MAX_ATTEMPTS% attempts, dependency installation could not complete.
  echo.
  echo This is often caused by:
  echo 1. Windows file locks on node_modules (EBUSY/EPERM errors)
  echo 2. Antivirus software interfering with npm
  echo 3. Electron processes holding file handles
  echo 4. Insufficient permissions
  echo.
  echo Recommended actions:
  echo 1. Close ALL editors, terminals, and file explorers
  echo 2. Disable antivirus temporarily (Windows Defender Real-time Protection)
  echo 3. Manually delete the "node_modules" folder in the app directory
  echo 4. Reboot your computer if the above doesn't work
  echo 5. Run this script again
  echo.
  echo If the error mentions "icudtl.dat" or similar Electron files:
  echo - These files are locked by a running Electron process
  echo - Check Task Manager for any "electron.exe" processes and end them
  echo - Or simply reboot your computer
  echo.
  echo Press any key to close...
  pause >nul
  exit /b 1
)

echo Dependencies installed successfully after %INSTALL_ATTEMPTS% attempt(s).
echo.

REM Verify electron-builder
echo [6/8] Verifying electron-builder...
call npm list electron-builder >nul 2>nul
if errorlevel 1 (
  echo electron-builder not found in dependencies. Installing it now...
  call npm install --save-dev electron-builder
  if errorlevel 1 (
    echo ERROR: npm dependency install failed.
    if "%NON_INTERACTIVE%"=="1" exit /b 1
    pause
    exit /b 1
  )
)
echo.

REM Check for known Windows build issues
echo [7/8] Checking for common Windows build issues...

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
echo.

REM Run the build
echo [8/8] Building Windows packages...
echo [build] Using npm run dist ^(release:prep -> build:player -> validate:player -> electron-builder^)
echo This may take several minutes. Please wait...
echo.

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
