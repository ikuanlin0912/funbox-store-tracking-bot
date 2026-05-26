@echo off
title Funbox Monitor Stopper
echo ==================================================
echo Funbox Store Tracking Bot - Stopper Tool
echo ==================================================
echo.
echo Stopping background monitor processes...

taskkill /f /fi "windowtitle eq Funbox Store Tracking Bot" >nul 2>&1

for /f "tokens=5" %%a in ('netstat -aon ^| findstr 18765') do (
    taskkill /f /pid %%a >nul 2>&1
    echo [Success] Terminated background process PID: %%a
)

echo.
echo [Done] Background processes cleaned up.
echo.
pause
