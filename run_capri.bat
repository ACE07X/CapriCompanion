@echo off
setlocal
cd /d "%~dp0"
set "TEMP=%~dp0.setup-temp"
set "TMP=%TEMP%"
if not exist "%TEMP%" mkdir "%TEMP%"
set "OLLAMA_HOST=127.0.0.1:11435"
set "OLLAMA_MODELS=%~dp0.capri-data\ollama-models"
set "OLLAMA_NO_CLOUD=1"
set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not exist "%OLLAMA_EXE%" set "OLLAMA_EXE=%USERPROFILE%\AppData\Local\Programs\Ollama\ollama.exe"
if not exist "%OLLAMA_EXE%" set "OLLAMA_EXE=%ProgramFiles%\Ollama\ollama.exe"
if not exist "%OLLAMA_EXE%" (
  echo Ollama was not found. Run setup_local_model.ps1 first.
  pause
  exit /b 1
)
set "CAPRI_PY=%~dp0.venv\Scripts\python.exe"
if not exist "%CAPRI_PY%" (
  echo Capri has not been set up yet.
  echo Run setup_local_model.ps1 first, then start Capri again.
  pause
  exit /b 1
)
"%CAPRI_PY%" -c "import kokoro_onnx, webview" >nul 2>&1
if errorlevel 1 (
  echo Capri's natural offline voice and desktop window are not installed yet.
  echo Run setup_local_model.ps1 first, then start Capri again.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$deadline=(Get-Date).AddSeconds(20); do { try { Invoke-RestMethod -Uri 'http://127.0.0.1:11435/api/tags' -TimeoutSec 1 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } } while ((Get-Date) -lt $deadline); exit 1" >nul 2>&1
if errorlevel 1 (
  start "" /min "%OLLAMA_EXE%" serve
  powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$deadline=(Get-Date).AddSeconds(20); do { try { Invoke-RestMethod -Uri 'http://127.0.0.1:11435/api/tags' -TimeoutSec 1 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } } while ((Get-Date) -lt $deadline); exit 1" >nul 2>&1
  if errorlevel 1 (
    echo The local Ollama service did not start. Restart Windows and try again.
    pause
    exit /b 1
  )
)

"%CAPRI_PY%" "%~dp0companion.py"
