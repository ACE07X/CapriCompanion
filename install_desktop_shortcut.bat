@echo off
rem Adds a Capri icon to the Desktop and Start menu (after setup_local_model.bat has run once).
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_desktop_shortcut.ps1"
