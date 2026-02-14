@echo off
setlocal
call "%~dp0..\..\install_and_run.bat" %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
