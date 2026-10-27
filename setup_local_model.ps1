$ErrorActionPreference = 'Stop'
$ProjectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalAppDataRoot = $env:LOCALAPPDATA
if ([string]::IsNullOrWhiteSpace($LocalAppDataRoot) -or $LocalAppDataRoot -match '\\Packages\\') {
    $LocalAppDataRoot = Join-Path $env:USERPROFILE 'AppData\Local'
}
$DataPath = Join-Path $ProjectPath '.capri-data'
$OllamaModelsPath = Join-Path $DataPath 'ollama-models'
$OllamaHost = '127.0.0.1:11435'
$TempPath = Join-Path $ProjectPath '.setup-temp'
$VenvPath = Join-Path $ProjectPath '.venv'
$VenvPython = Join-Path $VenvPath 'Scripts\python.exe'
$ModelPath = Join-Path $DataPath 'models\vosk-model-small-en-us-0.15'
$ModelZip = Join-Path $DataPath 'models\vosk-model-small-en-us-0.15.zip'
$VoiceDir = Join-Path $DataPath 'voices'
$TtsModelPath = Join-Path $VoiceDir 'kokoro-v1.0.onnx'
$TtsVoicesPath = Join-Path $VoiceDir 'voices-v1.0.bin'
$ModelName = 'qwen3.5:4b'

# SHA-256 of the exact files this script downloads (checked after download, before use).
# Update these together with the URLs below if you ever change versions.
$TtsModelSha256 = 'BEB0D1848DEE9A49DA392CC3DF26958D46CFA35D321EDF434F52949153F0DF3A'
$TtsVoicesSha256 = 'BCA610B8308E8D99F32E6FE4197E7EC01679264EFED0CAC9140FE9C29F1FBF7D'
# Optional: paste (Get-FileHash <vosk zip>).Hash here to also verify the speech model download.
$VoskSha256 = ''

function Confirm-FileHash {
    param([string]$Path, [string]$Expected, [string]$Label)
    if ([string]::IsNullOrWhiteSpace($Expected)) { return }
    $Actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    if ($Actual -ne $Expected) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
        throw "The downloaded $Label did not match its expected checksum, so it was deleted. Check your connection and run setup again."
    }
}

Write-Host ''
Write-Host 'CAPRI LOCAL SETUP' -ForegroundColor Magenta
Write-Host 'This setup installs Ollama and local Python packages, then downloads:'
Write-Host "  - $ModelName local model: about 3.3-4.0 GB"
Write-Host '  - English offline speech recognition: about 40 MB'
Write-Host '  - Capri-inspired offline voice: about 355 MB'
Write-Host 'After this one-time setup, chat, microphone transcription, and speech run locally.'
Write-Host 'Screen vision uses a one-time approval and sends a temporary image only to the local model.'
Write-Host 'This is an original local voice style; no anime voice actor is cloned.'
Write-Host ''
$Answer = Read-Host 'Continue with installation and downloads? Type Y to continue'
if ($Answer -notin @('Y', 'y', 'YES', 'Yes', 'yes')) {
    Write-Host 'Setup cancelled. No downloads were started.'
    Read-Host 'Press Enter to close'
    exit 0
}

New-Item -ItemType Directory -Force -Path $DataPath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataPath 'models') | Out-Null
New-Item -ItemType Directory -Force -Path $VoiceDir | Out-Null
New-Item -ItemType Directory -Force -Path $OllamaModelsPath | Out-Null
New-Item -ItemType Directory -Force -Path $TempPath | Out-Null
if ([string]::IsNullOrWhiteSpace($env:TEMP) -or $env:TEMP -match '\\Packages\\sandbox\.') { $env:TEMP = $TempPath }
if ([string]::IsNullOrWhiteSpace($env:TMP) -or $env:TMP -match '\\Packages\\sandbox\.') { $env:TMP = $TempPath }
$env:PIP_CACHE_DIR = Join-Path $TempPath 'pip-cache'

$Python313 = Get-Command py -ErrorAction SilentlyContinue
if (-not $Python313) {
    Write-Host 'Python Launcher was not found. Install Python 3.13 from python.org, then run this setup again.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
$PreviousErrorPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& py -3.13 -c "import sys" 2>&1 | Out-Null
$Python313Found = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $PreviousErrorPreference
if (-not $Python313Found -and -not (Test-Path $VenvPython)) {
    Write-Host 'The Python Launcher is installed, but Python 3.13 is not. Install Python 3.13 from python.org, then run this setup again.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

if (-not (Test-Path $VenvPython)) {
    Write-Host 'Creating Capri speech environment with Python 3.13...' -ForegroundColor Cyan
    & py -3.13 -m venv $VenvPath
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the local Python environment.' }
}

Write-Host 'Installing offline speech tools...' -ForegroundColor Cyan
& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Could not update the local package installer.' }
& $VenvPython -m pip install -r (Join-Path $ProjectPath 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Could not install Vosk, Kokoro voice, and desktop window packages. Check the Python 3.13 installation and try again.' }

if (-not (Test-Path $ModelPath)) {
    Write-Host 'Downloading the small English speech-recognition model...' -ForegroundColor Cyan
    & curl.exe --fail --location --silent --show-error --output $ModelZip 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip'
    if ($LASTEXITCODE -ne 0) { throw 'Could not download the offline speech-recognition model.' }
    Confirm-FileHash -Path $ModelZip -Expected $VoskSha256 -Label 'speech-recognition model'
    $PreviousProgressPreference = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try { Expand-Archive -LiteralPath $ModelZip -DestinationPath (Join-Path $DataPath 'models') -Force }
    finally { $ProgressPreference = $PreviousProgressPreference }
    Remove-Item -LiteralPath $ModelZip -Force
}

if (-not (Test-Path $TtsModelPath)) {
    Write-Host 'Downloading the natural offline voice model...' -ForegroundColor Cyan
    $PartialModelPath = "$TtsModelPath.part"
    & curl.exe --fail --location --retry 3 --silent --show-error --output $PartialModelPath 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx'
    if ($LASTEXITCODE -ne 0) { Remove-Item -LiteralPath $PartialModelPath -Force -ErrorAction SilentlyContinue; throw 'Could not download the offline voice model.' }
    Confirm-FileHash -Path $PartialModelPath -Expected $TtsModelSha256 -Label 'offline voice model'
    Move-Item -LiteralPath $PartialModelPath -Destination $TtsModelPath -Force
}

if (-not (Test-Path $TtsVoicesPath)) {
    Write-Host 'Downloading the offline voice pack...' -ForegroundColor Cyan
    $PartialVoicesPath = "$TtsVoicesPath.part"
    & curl.exe --fail --location --retry 3 --silent --show-error --output $PartialVoicesPath 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin'
    if ($LASTEXITCODE -ne 0) { Remove-Item -LiteralPath $PartialVoicesPath -Force -ErrorAction SilentlyContinue; throw 'Could not download the offline voice pack.' }
    Confirm-FileHash -Path $PartialVoicesPath -Expected $TtsVoicesSha256 -Label 'offline voice pack'
    Move-Item -LiteralPath $PartialVoicesPath -Destination $TtsVoicesPath -Force
}

$OllamaCommand = Get-Command ollama -ErrorAction SilentlyContinue
$OllamaExe = $null
if ($OllamaCommand) { $OllamaExe = $OllamaCommand.Source }
if (-not $OllamaExe) {
    $Candidates = @(
        (Join-Path $LocalAppDataRoot 'Programs\Ollama\ollama.exe'),
        (Join-Path $env:ProgramFiles 'Ollama\ollama.exe')
    )
    $OllamaExe = $Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $OllamaExe) {
    $Winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $Winget) {
        Write-Host 'Ollama was not found and winget is unavailable. Install Ollama for Windows from https://ollama.com/download/windows, then run this script again.' -ForegroundColor Red
        Read-Host 'Press Enter to close'
        exit 1
    }
    Write-Host 'Installing Ollama for Windows...' -ForegroundColor Cyan
    & $Winget.Source install --id Ollama.Ollama --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw 'Ollama installation did not finish successfully.' }

    $OllamaCommand = Get-Command ollama -ErrorAction SilentlyContinue
    if ($OllamaCommand) { $OllamaExe = $OllamaCommand.Source }
    if (-not $OllamaExe) {
        $OllamaExe = @(
        (Join-Path $LocalAppDataRoot 'Programs\Ollama\ollama.exe'),
            (Join-Path $env:ProgramFiles 'Ollama\ollama.exe')
        ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    }
}

if (-not $OllamaExe) { throw 'Ollama was installed but its command could not be located. Restart Windows, then run this setup again.' }

$ServiceReady = $false
$env:OLLAMA_HOST = $OllamaHost
$env:OLLAMA_MODELS = $OllamaModelsPath
$env:OLLAMA_NO_CLOUD = '1'
for ($i = 0; $i -lt 12; $i++) {
    try {
        Invoke-RestMethod -Uri "http://$OllamaHost/api/tags" -TimeoutSec 2 | Out-Null
        $ServiceReady = $true
        break
    } catch { Start-Sleep -Seconds 2 }
}
if (-not $ServiceReady) {
    Write-Host 'Starting the local Ollama service...' -ForegroundColor Cyan
    Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -WindowStyle Hidden
    for ($i = 0; $i -lt 20; $i++) {
        try {
            Invoke-RestMethod -Uri "http://$OllamaHost/api/tags" -TimeoutSec 2 | Out-Null
            $ServiceReady = $true
            break
        } catch { Start-Sleep -Seconds 2 }
    }
}
if (-not $ServiceReady) { throw 'The local Ollama service did not start. Restart the computer and run this setup again.' }

Write-Host "Downloading $ModelName for a lighter fit on the RTX 4060..." -ForegroundColor Cyan
& $OllamaExe pull $ModelName
if ($LASTEXITCODE -ne 0) { throw 'The local model download did not finish successfully.' }

Write-Host ''
Write-Host 'Setup is complete.' -ForegroundColor Green
Write-Host 'Run run_capri.bat in this folder to open Capri as a Windows desktop app.'
Write-Host 'All models are local after setup. Screen images are not saved. The voice runs on CPU; the 2K-context language model stays loaded while Capri is open and unloads when you exit.'
Read-Host 'Press Enter to close'

