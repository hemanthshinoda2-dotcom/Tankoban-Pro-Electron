@echo off
setlocal EnableExtensions

REM Build Tankoban Qt Player into a standalone Windows bundle (PyInstaller --onedir)
REM Output: app\player_qt\dist\TankobanPlayer\TankobanPlayer.exe
REM This bundle is copied into the Electron installer via electron-builder extraResources.

cd /d "%~dp0"

echo [player] preflight checks

REM Pick a Python launcher
set "PY_CMD="
where py >nul 2>nul
if %errorlevel%==0 (
  set "PY_CMD=py"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 set "PY_CMD=python"
)

if "%PY_CMD%"=="" (
  echo [player] ERROR: Python was not found on PATH.
  REM NOTE: Avoid unescaped parentheses inside parenthesized blocks (cmd.exe parser gotcha)
  echo [player] Install Python 3.10+ or the "py" launcher, then re-run the build.
  exit /b 1
)

for /f "tokens=2 delims= " %%i in ('%PY_CMD% --version 2^>^&1') do set "PY_VERSION=%%i"
if "%PY_VERSION%"=="" (
  echo [player] ERROR: unable to detect Python version from %PY_CMD%.
  exit /b 1
)

for /f "tokens=1-3 delims=." %%a in ("%PY_VERSION%") do (
  set "PY_MAJ=%%a"
  set "PY_MIN=%%b"
)

if "%PY_MAJ%"=="" (
  echo [player] ERROR: unable to parse Python major version from %PY_VERSION%.
  exit /b 1
)

if %PY_MAJ% LSS 3 (
  echo [player] ERROR: Python 3.10+ is required, found %PY_VERSION%.
  exit /b 1
)

if %PY_MAJ% EQU 3 if %PY_MIN% LSS 10 (
  echo [player] ERROR: Python 3.10+ is required, found %PY_VERSION%.
  exit /b 1
)

echo [player] Python: %PY_VERSION% via %PY_CMD%

REM Create an isolated venv for building (keeps dev .venv separate)
if not exist ".venv_build" (
  echo [player] creating venv: .venv_build
  if "%PY_CMD%"=="py" (
    py -3 -m venv .venv_build
  ) else (
    python -m venv .venv_build
  )
  if errorlevel 1 (
    echo [player] ERROR: failed to create venv
    exit /b 1
  )
)

call ".venv_build\Scripts\activate.bat"
if errorlevel 1 (
  echo [player] ERROR: failed to activate venv
  exit /b 1
)

python --version >nul 2>nul
if errorlevel 1 (
  echo [player] ERROR: activated venv has no python executable.
  exit /b 1
)

python -m pip --version >nul 2>nul
if errorlevel 1 (
  echo [player] ERROR: pip is unavailable in .venv_build.
  exit /b 1
)

echo [player] upgrading pip
python -m pip install --upgrade pip || exit /b 1

echo [player] installing requirements
python -m pip install -r requirements.txt || exit /b 1

echo [player] installing pyinstaller
python -m pip install pyinstaller || exit /b 1

for /f "tokens=*" %%i in ('pyinstaller --version 2^>nul') do set "PYINSTALLER_VERSION=%%i"
if "%PYINSTALLER_VERSION%"=="" (
  echo [player] ERROR: pyinstaller command is unavailable after installation.
  exit /b 1
)
echo [player] PyInstaller: %PYINSTALLER_VERSION%

echo [player] building (PyInstaller)
REM The player only uses QtCore, QtGui, QtWidgets, QtNetwork.
REM Exclude all other PySide6 modules to reduce bundle size (~100-150 MB savings).
pyinstaller --noconsole --onedir --clean --name TankobanPlayer ^
  --exclude-module PySide6.QtWebEngine ^
  --exclude-module PySide6.QtWebEngineCore ^
  --exclude-module PySide6.QtWebEngineWidgets ^
  --exclude-module PySide6.QtWebChannel ^
  --exclude-module PySide6.QtQuick ^
  --exclude-module PySide6.QtQuick3D ^
  --exclude-module PySide6.QtQml ^
  --exclude-module PySide6.QtMultimedia ^
  --exclude-module PySide6.QtMultimediaWidgets ^
  --exclude-module PySide6.Qt3DCore ^
  --exclude-module PySide6.Qt3DRender ^
  --exclude-module PySide6.Qt3DInput ^
  --exclude-module PySide6.Qt3DLogic ^
  --exclude-module PySide6.Qt3DAnimation ^
  --exclude-module PySide6.Qt3DExtras ^
  --exclude-module PySide6.QtCharts ^
  --exclude-module PySide6.QtDataVisualization ^
  --exclude-module PySide6.QtBluetooth ^
  --exclude-module PySide6.QtDesigner ^
  --exclude-module PySide6.QtHelp ^
  --exclude-module PySide6.QtSensors ^
  --exclude-module PySide6.QtSerialPort ^
  --exclude-module PySide6.QtTest ^
  --exclude-module PySide6.QtSql ^
  --exclude-module PySide6.QtSvg ^
  --exclude-module PySide6.QtSvgWidgets ^
  --exclude-module PySide6.QtOpenGL ^
  --exclude-module PySide6.QtOpenGLWidgets ^
  --exclude-module PySide6.QtPdf ^
  --exclude-module PySide6.QtPdfWidgets ^
  --exclude-module PySide6.QtRemoteObjects ^
  --exclude-module PySide6.QtPositioning ^
  --exclude-module PySide6.QtNfc ^
  --exclude-module PySide6.QtDBus ^
  --exclude-module PySide6.QtScxml ^
  --exclude-module PySide6.QtStateMachine ^
  --exclude-module PySide6.QtHttpServer ^
  --exclude-module PySide6.QtWebSockets ^
  run_player.py
if errorlevel 1 (
  echo [player] ERROR: PyInstaller build failed
  exit /b 1
)

set "PLAYER_DIST_DIR=dist\TankobanPlayer"
set "PLAYER_EXE=%PLAYER_DIST_DIR%\TankobanPlayer.exe"
if not exist "%PLAYER_EXE%" (
  echo [player] ERROR: expected artifact missing: %PLAYER_EXE%
  exit /b 1
)

if not exist "%PLAYER_DIST_DIR%\_internal" (
  echo [player] ERROR: expected runtime folder missing: %PLAYER_DIST_DIR%\_internal
  exit /b 1
)

dir /b "%PLAYER_DIST_DIR%\_internal\*.dll" >nul 2>nul
if errorlevel 1 (
  echo [player] ERROR: expected runtime DLLs are missing in %PLAYER_DIST_DIR%\_internal
  exit /b 1
)

dir /b "%PLAYER_DIST_DIR%\_internal\*.pyd" >nul 2>nul
if errorlevel 1 (
  echo [player] ERROR: expected Python extension modules are missing in %PLAYER_DIST_DIR%\_internal
  exit /b 1
)

echo [player] artifact validation passed

echo [player] OK: built dist\TankobanPlayer\TankobanPlayer.exe
exit /b 0
