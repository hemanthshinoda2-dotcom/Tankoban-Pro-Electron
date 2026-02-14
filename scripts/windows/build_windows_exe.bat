@echo off
setlocal
call "%~dp0..\..\build_windows_exe.bat" %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
