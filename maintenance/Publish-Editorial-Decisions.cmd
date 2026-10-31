@echo off
rem Publish the pending catalog edits (Edit-Catalog-Item.cmd) and a subject-edits.json exported from the review pages as one pull request.
rem Reads Downloads\subject-edits.json and the newest numbered review export. Drag another export onto this launcher to use it instead.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\run-node-tool.ps1" publish-editorial-decisions.mjs %*
set "TOOL_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %TOOL_EXIT%
