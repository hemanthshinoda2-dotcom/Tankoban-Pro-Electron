@echo off
setlocal

REM Tankoban Qt Player installer (Pro V2)
REM Creates a venv and installs dependencies.

cd /d %~dp0

if not exist .venv (
  python -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo.
echo OK: Qt player dependencies installed.
echo.
pause
