@echo off
setlocal EnableDelayedExpansion

REM BUILD72: Robust Windows build script
REM - Always keeps console open on any failure
REM - Shows full error messages with context
REM - Handles common Windows edge cases
REM - Provides clear guidance on failures

echo ========================================
echo Tankoban Plus Build Script - Build 72
echo ========================================
echo.

REM Change to app directory - critical first step
cd /d "%~dp0app" 2>nul
if errorlevel 1 (
  echo ERROR: Could not change to app directory
  echo Expected path: %~dp0app
  echo Current directory: %CD%
  echo.
  echo Press any key to close...
  pause >nul
  exit /b 1
)

echo Working directory: %CD%
echo.

REM Check Node.js availability
echo [1/5] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Node.js is not installed or not in PATH
  echo.
  echo Please install Node.js LTS from: https://nodejs.org/
  echo After installation, restart your terminal and run this script again.
  echo.
  echo Press any key to close...
  pause >nul
  exit /b 1
)

REM Show Node version for diagnostics
for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VERSION=%%i
echo Found Node.js: !NODE_VERSION!

REM Check npm availability
where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: npm is not available
  echo Node.js is installed but npm was not found.
  echo This is unusual - try reinstalling Node.js.
  echo.
  echo Press any key to close...
  pause >nul
  exit /b 1
)

for /f "tokens=*" %%i in ('npm --version 2^>nul') do set NPM_VERSION=%%i
echo Found npm: !NPM_VERSION!
echo.

REM Install dependencies
echo [2/5] Installing dependencies...

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

if exist package-lock.json (
  echo Found package-lock.json - attempting clean install with npm ci...
  call npm ci 2>&1
  if !errorlevel! equ 0 (
    set INSTALL_SUCCESS=1
    goto INSTALL_DONE
  )
  
  echo npm ci failed (error code: !errorlevel!). Checking error type...
  
  REM Check if it's an EBUSY error by looking for specific error patterns
  REM EBUSY errors typically mention "resource busy or locked" or "EBUSY"
  
  if %INSTALL_ATTEMPTS% lss %MAX_ATTEMPTS% (
    echo This may be a file lock issue (EBUSY/EPERM). Retrying...
    echo Waiting 3 seconds before retry...
    timeout /t 3 /nobreak >nul 2>&1
    goto INSTALL_RETRY
  ) else (
    echo npm ci failed after %MAX_ATTEMPTS% attempts. Trying npm install as fallback...
    call npm install 2>&1
    if !errorlevel! equ 0 (
      set INSTALL_SUCCESS=1
      goto INSTALL_DONE
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
echo [3/5] Verifying electron-builder...
call npm list electron-builder >nul 2>nul
if errorlevel 1 (
  echo electron-builder not found in dependencies. Installing it now...
  call npm install --save-dev electron-builder
  if errorlevel 1 (
    echo.
    echo ERROR: Failed to install electron-builder
    echo.
    echo This is required to build the Windows executable.
    echo Check the error messages above for details.
    echo.
    echo Press any key to close...
    pause >nul
    exit /b 1
  )
  echo electron-builder installed successfully.
) else (
  echo electron-builder is available.
)
echo.

REM Check for known Windows build issues
echo [4/5] Checking for common Windows build issues...

REM Check if running as admin (helps with symlink issues)
net session >nul 2>&1
if errorlevel 1 (
  echo Note: Not running as Administrator.
  echo If build fails with "symlink" or "winCodeSign" errors, try running as Admin.
) else (
  echo Running with Administrator privileges.
)

REM Check for Developer Mode (helps with symlinks on Windows 10+)
reg query "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense >nul 2>&1
if errorlevel 1 (
  echo Note: Developer Mode is not enabled.
  echo If build fails with symlink errors, consider enabling Developer Mode:
  echo   Settings ^> Update ^& Security ^> For Developers ^> Developer Mode
) else (
  echo Developer Mode is enabled.
)
echo.

REM Run the build
echo [5/5] Building Windows packages...
echo This may take several minutes. Please wait...
echo.

call npm run dist
set BUILD_RESULT=!errorlevel!

echo.
if !BUILD_RESULT! equ 0 (
  echo ========================================
  echo BUILD SUCCESSFUL!
  echo ========================================
  echo.
  echo Output files are in the "dist" folder:
  echo - Tankoban Plus installer ^(NSIS .exe^)
  echo - Tankoban Plus portable ^(.exe^)
  echo.
  echo The build process completed successfully.
  echo.
  pause
  exit /b 0
) else (
  echo ========================================
  echo BUILD FAILED
  echo ========================================
  echo.
  echo Exit code: !BUILD_RESULT!
  echo.
  echo Review the error messages above for details.
  echo.
  echo Common issues and solutions:
  echo.
  echo 1. "winCodeSign" or "symlink" errors:
  echo    - Run this script as Administrator
  echo    - Enable Windows Developer Mode
  echo    - Or disable code signing in package.json if not distributing
  echo.
  echo 2. "EPERM" or "ENOTEMPTY" errors:
  echo    - Close all editors, terminals, and file explorers
  echo    - Delete the "dist" and "node_modules" folders
  echo    - Run this script again
  echo.
  echo 3. Network or download errors:
  echo    - Check your internet connection
  echo    - Check if antivirus is blocking downloads
  echo    - Retry the build
  echo.
  echo 4. "electron-builder" errors:
  echo    - Ensure you're using a current version of Node.js LTS
  echo    - Try: npm install --save-dev electron-builder@latest
  echo.
  echo Press any key to close...
  pause >nul
  exit /b !BUILD_RESULT!
)

endlocal
