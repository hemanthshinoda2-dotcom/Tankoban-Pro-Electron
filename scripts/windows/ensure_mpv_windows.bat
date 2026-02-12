@echo off
setlocal

set "PS_SCRIPT=%~dp0download_mpv_windows.ps1"
if not exist "%PS_SCRIPT%" (
  echo [mpv] ERROR: missing script: %PS_SCRIPT%
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
if errorlevel 1 (
  echo [mpv] ERROR: could not prepare MPV runtime files.
  exit /b 1
)

exit /b 0
