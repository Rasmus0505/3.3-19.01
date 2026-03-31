$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopDir = Join-Path $ProjectRoot "desktop-client"
$FastUpdateScript = Join-Path $DesktopDir "scripts\update-win-unpacked.mjs"
$FullRebuildScript = Join-Path $ProjectRoot "rebuild-desktop-client.ps1"
$FixedDir = Join-Path $DesktopDir "dist-fixed\win-unpacked"
$TargetExe = Join-Path $FixedDir "Bottle.exe"
$FastUpdateFallbackExitCode = 20

function Write-Step {
    param(
        [string]$Step,
        [string]$Message
    )

    Write-Host ""
    Write-Host "[$Step] $Message" -ForegroundColor Yellow
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

function Assert-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Stop-BottleProcess {
    $processes = @(Get-Process -Name "Bottle" -ErrorAction SilentlyContinue)
    if (-not $processes -or $processes.Count -eq 0) {
        return $false
    }

    Write-Step -Step "0/4" -Message "Closing running Bottle.exe"
    foreach ($process in $processes) {
        try {
            if ($process.MainWindowHandle -ne 0) {
                [void]$process.CloseMainWindow()
            }
        } catch {
            Write-Host "Graceful close failed for PID $($process.Id): $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
    }

    Start-Sleep -Seconds 2
    $stillRunning = @(Get-Process -Name "Bottle" -ErrorAction SilentlyContinue)
    if ($stillRunning.Count -gt 0) {
        Write-Host "Bottle.exe did not exit in time, forcing shutdown..." -ForegroundColor DarkYellow
        $stillRunning | Stop-Process -Force
        Start-Sleep -Seconds 1
    }

    Write-Host "Bottle.exe closed." -ForegroundColor Green
    return $true
}

function Invoke-NodeScript {
    param(
        [string]$ScriptPath,
        [string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        & node $ScriptPath | Out-Host
        return [int]$LASTEXITCODE
    } finally {
        Pop-Location
    }
}

Write-Host "=== Update Desktop Client ===" -ForegroundColor Cyan
Write-Host "Target launch path: $TargetExe" -ForegroundColor Cyan

Assert-PathExists -Path $DesktopDir -Description "desktop-client directory"
Assert-PathExists -Path $FastUpdateScript -Description "fast desktop update script"
Assert-PathExists -Path $FullRebuildScript -Description "full rebuild script"
Assert-Command -Name "node"
Assert-Command -Name "npm"

$hadRunningBottle = Stop-BottleProcess

$usedFullRebuild = $false

Write-Step -Step "1/4" -Message "Applying latest desktop changes"
$fastUpdateExitCode = Invoke-NodeScript -ScriptPath $FastUpdateScript -WorkingDirectory $ProjectRoot
if ($fastUpdateExitCode -eq $FastUpdateFallbackExitCode) {
    Write-Host "Fast update unavailable, falling back to full package rebuild..." -ForegroundColor DarkYellow
    $usedFullRebuild = $true
    & $FullRebuildScript
    if ($LASTEXITCODE -ne 0) {
        throw "Full rebuild failed with exit code $LASTEXITCODE"
    }
} elseif ($fastUpdateExitCode -ne 0) {
    Write-Host "Fast update failed, falling back to full package rebuild..." -ForegroundColor DarkYellow
    $usedFullRebuild = $true
    & $FullRebuildScript
    if ($LASTEXITCODE -ne 0) {
        throw "Full rebuild failed with exit code $LASTEXITCODE"
    }
}

Write-Step -Step "2/4" -Message "Validating launch bundle"
Assert-PathExists -Path $TargetExe -Description "Bottle.exe"

Write-Step -Step "3/4" -Message "Starting updated Bottle.exe"
Start-Process -FilePath $TargetExe | Out-Null
Write-Host "Bottle.exe started." -ForegroundColor Green

Write-Step -Step "4/4" -Message "Desktop update complete"
if ($usedFullRebuild) {
    Write-Host "Used full rebuild path." -ForegroundColor Green
} else {
    Write-Host "Used fast incremental update path." -ForegroundColor Green
}
if ($hadRunningBottle) {
    Write-Host "Previous Bottle.exe instance was closed before update." -ForegroundColor Green
}
Write-Host "Launch target: $TargetExe" -ForegroundColor White
Write-Host ""
