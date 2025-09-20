@echo off
REM TGCall Link Generator for Windows
REM Creates a new video call and returns the shareable link

echo 🚀 TGCall Link Generator
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Run the call generator
node "%~dp0create-call.js" %*

REM Keep window open if there was an error
if %errorlevel% neq 0 (
    echo.
    echo Press any key to exit...
    pause >nul
)
