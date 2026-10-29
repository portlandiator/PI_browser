@echo off
rem Zip older backups in .qa and remove old working copies that earlier tool versions left there.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\run-node-tool.ps1" tidy-qa.mjs %*
set "TOOL_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %TOOL_EXIT%
