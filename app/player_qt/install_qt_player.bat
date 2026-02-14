@echo off
setlocal
cd /d "%~dp0"

REM Legacy compatibility wrapper.
REM install_windows.bat is the canonical installer and supports --non-interactive.
call "%~dp0install_windows.bat" %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
