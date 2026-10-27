@echo off
rem Starts Capri with a console window (useful for troubleshooting).
rem The desktop icon does the same thing without the console.
setlocal
cd /d "%~dp0"
set "CAPRI_PY=%~dp0.venv\Scripts\python.exe"
if not exist "%CAPRI_PY%" (
  echo Capri has not been set up yet.
  echo Run setup_local_model.bat first, then start Capri again.
  pause
  exit /b 1
)
"%CAPRI_PY%" -c "import kokoro_onnx, webview" >nul 2>&1
if errorlevel 1 (
  echo Capri's natural offline voice and desktop window are not installed yet.
  echo Run setup_local_model.bat first, then start Capri again.
  pause
  exit /b 1
)
rem companion.py starts Capri's private Ollama service itself (port 11435) and stops it on exit.
"%CAPRI_PY%" "%~dp0companion.py"
if errorlevel 1 pause
