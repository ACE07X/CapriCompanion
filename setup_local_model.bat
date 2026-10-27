@echo off
rem Double-click launcher for the one-time setup. The script itself asks before installing or downloading anything.
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_local_model.ps1"

