@echo off
title Funbox Monitor Setup
echo ==================================================
echo Funbox Store Tracking Bot - Environment Setup Tool
echo ==================================================
echo.

:: 1. Check Node.js
echo [Step 1] Checking Node.js environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [Warning] Node.js is not installed.
    echo Trying to install Node.js automatically via winget...
    winget install OpenJS.NodeJS --source winget
    if %errorlevel% neq 0 (
        echo [Error] Automatic installation failed. Please download Node.js manually: https://nodejs.org/
        pause
        exit /b
    )
    echo [Success] Node.js installed. Please restart this window and run setup.bat again.
    pause
    exit /b
) else (
    echo [Success] Node.js is already installed.
)
echo.

:: 2. Rewrite start_bot.bat
echo [Step 2] Optimizing start_bot.bat...
(
echo @echo off
echo title Funbox Store Tracking Bot
echo cd /d "%%~dp0"
echo set TG_BOT_TOKEN=YOUR_TG_BOT_TOKEN_HERE
echo set TG_CHAT_ID=YOUR_TG_CHAT_ID_HERE
echo node funbox_monitor.js ^>^> bot.log 2^>^&1
echo pause
) > start_bot.bat
echo [Success] start_bot.bat updated.
echo.

:: 3. Reinstall dependencies
echo [Step 3] Rebuilding package dependencies (this may take 1-2 mins)...
if exist node_modules (
    echo Cleaning old node_modules...
    rmdir /s /q node_modules
)
call npm install
if %errorlevel% neq 0 (
    echo [Error] Failed to install packages.
    pause
    exit /b
)
echo [Success] Packages installed.
echo.

echo ==================================================
echo Setup completed! You can now run:
echo 1. Double click run_hidden.vbs for silent background monitoring.
echo 2. Double click start_bot.bat for console window monitoring.
echo ==================================================
pause
