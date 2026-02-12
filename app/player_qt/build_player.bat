@echo off
setlocal EnableExtensions

REM Build Tankoban Qt Player into a standalone Windows bundle (PyInstaller --onedir)
REM Output: app\player_qt\dist\TankobanPlayer\TankobanPlayer.exe
REM This bundle is copied into the Electron installer via electron-builder extraResources.

cd /d "%~dp0"

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

echo [player] upgrading pip
python -m pip install --upgrade pip || exit /b 1

echo [player] installing requirements
python -m pip install -r requirements.txt || exit /b 1

echo [player] installing pyinstaller
python -m pip install pyinstaller || exit /b 1

echo [player] building (PyInstaller)
pyinstaller --noconsole --onedir --clean --name TankobanPlayer run_player.py
if errorlevel 1 (
  echo [player] ERROR: PyInstaller build failed
  exit /b 1
)

echo [player] OK: built dist\TankobanPlayer\TankobanPlayer.exe
exit /b 0
