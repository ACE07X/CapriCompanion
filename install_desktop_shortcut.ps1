param([switch]$Quiet)
# Creates "Capri" shortcuts on the Desktop and in the Start menu, using Capri's face icon.
# The shortcut starts the app with pythonw.exe, so no console window appears.
$ErrorActionPreference = 'Stop'
$ProjectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$Pythonw = Join-Path $ProjectPath '.venv\Scripts\pythonw.exe'
$Companion = Join-Path $ProjectPath 'companion.py'
$Icon = Join-Path $ProjectPath 'web\capri.ico'

if (-not (Test-Path $Pythonw)) {
    Write-Host 'Capri has not been set up yet. Run setup_local_model.bat first.' -ForegroundColor Red
    if (-not $Quiet) { Read-Host 'Press Enter to close' }
    exit 1
}

$Shell = New-Object -ComObject WScript.Shell
# GetFolderPath follows OneDrive folder redirection, unlike a hard-coded %USERPROFILE%\Desktop.
$Targets = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Capri.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Capri.lnk')
)
foreach ($LinkPath in $Targets) {
    $Link = $Shell.CreateShortcut($LinkPath)
    $Link.TargetPath = $Pythonw
    $Link.Arguments = '"' + $Companion + '"'
    $Link.WorkingDirectory = $ProjectPath
    $Link.IconLocation = $Icon + ',0'
    $Link.Description = 'Capri - local cyberpunk desktop companion'
    $Link.Save()
    Write-Host "Created $LinkPath" -ForegroundColor Green
}
if (-not $Quiet) { Read-Host 'Done. Press Enter to close' }
