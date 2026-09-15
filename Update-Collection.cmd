@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-collection.ps1"
set "UPDATE_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %UPDATE_EXIT%
