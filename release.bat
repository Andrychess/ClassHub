@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\release.ps1" -Bump patch
if errorlevel 1 pause
