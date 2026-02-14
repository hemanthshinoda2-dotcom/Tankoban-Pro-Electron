@echo off
setlocal EnableDelayedExpansion

set "NON_INTERACTIVE=0"
if /I "%~1"=="--non-interactive" set "NON_INTERACTIVE=1"
if /I "%~1"=="--ci" set "NON_INTERACTIVE=1"
if /I "%TANKOBAN_NON_INTERACTIVE%"=="1" set "NON_INTERACTIVE=1"

echo ========================================
echo Tankoban Pro Build Script
echo ========================================
echo.

REM Change to app directory.
cd /d "%~dp0app" 2>nul
if errorlevel 1 (
  echo ERROR: Could not change to app directory.
  echo Expected path: %~dp0app
  echo Current directory: %CD%
  echo.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  echo Press any key to close...
  pause >nul
  exit /b 1
)

echo Working directory: %CD%
echo.

if not exist "package.json" (
  echo ERROR: package.json was not found in the app directory.
  echo Expected path: %CD%\package.json
  echo.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  echo Press any key to close...
  pause >nul
  exit /b 1
)

echo [1/7] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Node.js is not installed or not in PATH.
  echo Install Node.js LTS from https://nodejs.org/
  echo.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  echo Press any key to close...
  pause >nul
  exit /b 1
)
for /f "tokens=*" %%i in ('node --version 2^>nul') do set "NODE_VERSION=%%i"
echo Found Node.js: !NODE_VERSION!

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: npm is not available.
  echo Reinstall Node.js LTS and retry.
  echo.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  echo Press any key to close...
  pause >nul
  exit /b 1
)
for /f "tokens=*" %%i in ('npm --version 2^>nul') do set "NPM_VERSION=%%i"
echo Found npm: !NPM_VERSION!
echo.

echo [2/7] Checking Python...
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

if "!PYTHON_EXE!"=="" (
  echo.
  echo ERROR: Python was not found on PATH.
  echo Install Python 3.9+ from https://www.python.org/downloads/windows/
  echo and re-run this script.
  echo.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  echo Press any key to close...
  pause >nul
  exit /b 1
)

"!PYTHON_EXE!" !PYTHON_ARGS! -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)"
if errorlevel 1 (
  echo.
  echo ERROR: Unsupported Python version detected.
  echo Tankoban requires Python 3.9 or newer.
  echo.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  echo Press any key to close...
  pause >nul
  exit /b 1
)

for /f "tokens=*" %%i in ('"!PYTHON_EXE!" !PYTHON_ARGS! --version 2^>^&1') do set "PYTHON_VERSION=%%i"
echo Found !PYTHON_VERSION!
echo.

echo [3/7] Ensuring MPV runtime binaries...
call "%~dp0scripts\windows\ensure_mpv_windows.bat"
if errorlevel 1 (
  echo.
  echo ERROR: MPV runtime setup failed.
  echo Required files were not found and automatic download failed.
  echo Check your internet connection and retry.
  echo.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  echo Press any key to close...
  pause >nul
  exit /b 1
)
echo.

echo [4/7] Installing dependencies...
set "INSTALL_SUCCESS=0"
set "INSTALL_ATTEMPTS=0"
set "MAX_ATTEMPTS=3"

:INSTALL_RETRY
set /a INSTALL_ATTEMPTS+=1
echo Attempt %INSTALL_ATTEMPTS% of %MAX_ATTEMPTS%...

echo Checking for stray Electron processes...
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq electron.exe" /FO CSV /NH 2^>nul') do (
  set "PID=%%~i"
  if not "!PID!"=="" (
    echo Found Electron process: !PID!
    taskkill /PID !PID! /F >nul 2>&1
  )
)
timeout /t 2 /nobreak >nul 2>&1

if exist package-lock.json (
  echo Found package-lock.json. Attempting clean install with npm ci...
  call npm.cmd ci 2>&1
  if !errorlevel! equ 0 (
    set "INSTALL_SUCCESS=1"
    goto INSTALL_DONE
  )
  echo npm ci failed with error code !errorlevel!.
  if %INSTALL_ATTEMPTS% lss %MAX_ATTEMPTS% (
    echo This may be a file lock issue. Retrying...
    timeout /t 3 /nobreak >nul 2>&1
    goto INSTALL_RETRY
  ) else (
    echo npm ci failed after %MAX_ATTEMPTS% attempts. Trying npm install fallback...
    call npm.cmd install 2>&1
    if !errorlevel! equ 0 (
      set "INSTALL_SUCCESS=1"
      goto INSTALL_DONE
    )
  )
) else (
  echo No package-lock.json found. Using npm install...
  call npm.cmd install 2>&1
  if !errorlevel! equ 0 (
    set "INSTALL_SUCCESS=1"
    goto INSTALL_DONE
  )
  if %INSTALL_ATTEMPTS% lss %MAX_ATTEMPTS% (
    echo npm install failed. Retrying...
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
  echo Dependency installation could not complete after %MAX_ATTEMPTS% attempts.
  echo.
  echo Common causes:
  echo 1. File locks on node_modules
  echo 2. Antivirus interference
  echo 3. Running Electron processes
  echo 4. Insufficient permissions
  echo.
  echo Recommended actions:
  echo 1. Close editors, terminals, and file explorers
  echo 2. End electron.exe in Task Manager
  echo 3. Delete app\node_modules and retry
  echo 4. Reboot and run this script again
  echo.
  if "%NON_INTERACTIVE%"=="1" exit /b 1
  echo Press any key to close...
  pause >nul
  exit /b 1
)

echo Dependencies installed successfully after %INSTALL_ATTEMPTS% attempt(s).
echo.

echo [5/7] Verifying electron-builder...
call npm.cmd list electron-builder >nul 2>nul
if errorlevel 1 (
  echo electron-builder not found in dependencies. Installing it now...
  call npm.cmd install --save-dev electron-builder
  if errorlevel 1 (
    echo.
    echo ERROR: Failed to install electron-builder.
    echo.
    if "%NON_INTERACTIVE%"=="1" exit /b 1
    echo Press any key to close...
    pause >nul
    exit /b 1
  )
  echo electron-builder installed successfully.
) else (
  echo electron-builder is available.
)
echo.

echo [6/7] Checking common Windows build issues...
net session >nul 2>&1
if errorlevel 1 (
  echo Note: Not running as Administrator.
  echo If build fails with symlink or winCodeSign errors, try Administrator mode.
) else (
  echo Running with Administrator privileges.
)
reg query "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense >nul 2>&1
if errorlevel 1 (
  echo Note: Developer Mode is not enabled.
  echo If build fails with symlink errors, enable Developer Mode in Windows settings.
) else (
  echo Developer Mode is enabled.
)
echo.

echo [7/7] Building Windows packages...
echo [build] Using npm run dist ^(release:prep -> build:player -> validate:player -> electron-builder^)
echo This may take several minutes. Please wait...
echo.

call npm.cmd run dist
set "BUILD_RESULT=!errorlevel!"

echo.
if !BUILD_RESULT! equ 0 (
  echo ========================================
  echo BUILD SUCCESSFUL
  echo ========================================
  echo.
  echo Output files are in app\dist.
  echo.
  if "%NON_INTERACTIVE%"=="1" (
    endlocal
    exit /b 0
  )
  pause
  endlocal
  exit /b 0
)

echo ========================================
echo BUILD FAILED
echo ========================================
echo.
echo Exit code: !BUILD_RESULT!
echo Review the error messages above for details.
echo.
if "%NON_INTERACTIVE%"=="1" (
  endlocal
  exit /b !BUILD_RESULT!
)
echo Press any key to close...
pause >nul
endlocal
exit /b !BUILD_RESULT!
