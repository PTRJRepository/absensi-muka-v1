@echo off
echo ====================================
echo  ZKTeco Live Monitor
echo ====================================
echo.

cd /d "%~dp0"

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo This tool uses a Node bridge with node-zklib for machine access.
    pause
    exit /b 1
)

REM Check if dependencies are installed
python -c "import flet" >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo Starting ZKTeco Live Monitor...
echo.

REM Run the app
python main.py

if errorlevel 1 (
    echo.
    echo ERROR: Application crashed
    pause
)
