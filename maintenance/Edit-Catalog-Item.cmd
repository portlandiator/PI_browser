@echo off
rem Open the private local editor to correct or delete catalog items. Edits wait in Downloads\subject-edits.json until Publish-Editorial-Decisions.cmd publishes them.
rem The editor prints its link; if no browser page opens, copy that link into your browser. Keep this window open while editing.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\run-node-tool.ps1" edit-item-server.mjs
set "TOOL_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %TOOL_EXIT%
