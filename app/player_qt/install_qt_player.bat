@echo off
setlocal
cd /d %~dp0

if not exist .venv (
  python -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo.
echo Tankoban Qt Player installed.
echo If Tankoban cannot find Python later, set environment variable PYTHON_BIN to a full python.exe path.
echo.
pause
