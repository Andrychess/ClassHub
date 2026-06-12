@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\upload-release.ps1" %*
if errorlevel 1 pause
