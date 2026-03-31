$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopDir = Join-Path $ProjectRoot "desktop-client"
$PackagedDir = Join-Path $DesktopDir "dist\win-unpacked"
$FixedRoot = Join-Path $DesktopDir "dist-fixed"
$FixedDir = Join-Path $FixedRoot "win-unpacked"

function Write-Step {
    param(
        [string]$Step,
        [string]$Message
    )

    Write-Host ""
    Write-Host "[$Step] $Message" -ForegroundColor Yellow
}

function Assert-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Assert-PathExists {
    param(
        [string]$Path,
        [string]$Description
    )

    if (-not (Test-Path $Path)) {
        throw "$Description not found: $Path"
    }
}

function Invoke-Npm {
    param(
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        & npm @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

function Assert-DesktopBundle {
    param([string]$BundleRoot)

    $requiredPaths = @(
        (Join-Path $BundleRoot "Bottle.exe"),
        (Join-Path $BundleRoot "resources\app.asar"),
        (Join-Path $BundleRoot "resources\app.asar.unpacked\.cache\frontend-dist\index.html"),
        (Join-Path $BundleRoot "resources\desktop-helper-runtime\BottleLocalHelper\BottleLocalHelper.exe"),
        (Join-Path $BundleRoot "resources\runtime-defaults.json"),
        (Join-Path $BundleRoot "resources\runtime-tools\ffmpeg\ffmpeg.exe"),
        (Join-Path $BundleRoot "resources\runtime-tools\yt-dlp\yt-dlp.exe"),
        (Join-Path $BundleRoot "resources\preinstalled-models\faster-distil-small.en")
    )

    foreach ($requiredPath in $requiredPaths) {
        Assert-PathExists -Path $requiredPath -Description "Desktop bundle artifact"
    }
}

Write-Host "=== Rebuild Desktop Client ===" -ForegroundColor Cyan
Write-Host "Target launch path: $FixedDir\Bottle.exe" -ForegroundColor Cyan

$runningBottle = Get-Process -Name "Bottle" -ErrorAction SilentlyContinue
if ($runningBottle) {
    throw "Bottle.exe is currently running. Please close the desktop client and run this script again."
}

Assert-PathExists -Path $DesktopDir -Description "desktop-client directory"
Assert-PathExists -Path (Join-Path $DesktopDir "package.json") -Description "desktop-client package.json"
Assert-Command -Name "npm"
Assert-Command -Name "node"
Assert-Command -Name "pyinstaller"

Write-Step -Step "1/4" -Message "Packaging the latest desktop client"
Invoke-Npm -WorkingDirectory $ProjectRoot -Arguments @("--prefix", "desktop-client", "run", "package:win")

Write-Step -Step "2/4" -Message "Validating packaged win-unpacked output"
Assert-DesktopBundle -BundleRoot $PackagedDir
Write-Host "Packaged output is complete." -ForegroundColor Green

Write-Step -Step "3/4" -Message "Refreshing desktop-client\dist-fixed\win-unpacked"
New-Item -ItemType Directory -Path $FixedRoot -Force | Out-Null
if (-not (Test-Path $FixedDir)) {
    Copy-Item -Path $PackagedDir -Destination $FixedRoot -Recurse -Force
} else {
    Copy-Item -Path (Join-Path $PackagedDir "*") -Destination $FixedDir -Recurse -Force
}
Write-Host "dist-fixed has been refreshed." -ForegroundColor Green

Write-Step -Step "4/4" -Message "Validating final launch bundle"
Assert-DesktopBundle -BundleRoot $FixedDir
Write-Host "Desktop client is ready." -ForegroundColor Green

Write-Host ""
Write-Host "Open this file to test the updated client:" -ForegroundColor Cyan
Write-Host "  $FixedDir\Bottle.exe" -ForegroundColor White
Write-Host ""
