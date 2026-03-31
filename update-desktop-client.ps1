# Desktop Client Frontend Update Script
# Usage: right-click -> "Run with PowerShell"
#   OR double-click "更新桌面客户端前端.bat" in the same folder

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $ProjectRoot "frontend"
$DesktopDir = Join-Path $ProjectRoot "desktop-client"
$CacheFrontendDist = "$DesktopDir\dist-fixed\win-unpacked\resources\app.asar.unpacked\.cache\frontend-dist"

Write-Host "=== Desktop Client Update Flow ===" -ForegroundColor Cyan

# Step 1: Build frontend with desktop renderer mode
Write-Host ""
Write-Host "[1/4] Building frontend (desktop renderer mode)..." -ForegroundColor Yellow
Push-Location $FrontendDir
try {
    $env:BOTTLE_DESKTOP_RENDERER_BUILD = "1"
    npm run build
    Remove-Item Env:\BOTTLE_DESKTOP_RENDERER_BUILD -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
    Write-Host "Frontend build OK" -ForegroundColor Green
} finally {
    Pop-Location
}

# Step 2: Backup old assets
Write-Host ""
Write-Host "[2/4] Backing up old assets..." -ForegroundColor Yellow
$BackupDir = "$CacheFrontendDist\..\frontend-dist-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
if (Test-Path $CacheFrontendDist) {
    Copy-Item -Path $CacheFrontendDist -Destination $BackupDir -Recurse -Force
    Write-Host "Backup saved to: $BackupDir" -ForegroundColor Green
}

# Step 3: Copy new assets
Write-Host ""
Write-Host "[3/4] Copying new assets to desktop client..." -ForegroundColor Yellow
$NewDistDir = Join-Path $FrontendDir "dist"
if (Test-Path $NewDistDir) {
    if (Test-Path $CacheFrontendDist) {
        Remove-Item -Path $CacheFrontendDist -Recurse -Force
    }
    Copy-Item -Path $NewDistDir -Destination $CacheFrontendDist -Recurse -Force
    Write-Host "Assets copied OK" -ForegroundColor Green
} else {
    throw "Frontend dist not found at $NewDistDir"
}

# Step 4: Done
Write-Host ""
Write-Host "[4/4] Done!" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend assets updated in desktop client." -ForegroundColor Cyan
Write-Host "Assets path: $CacheFrontendDist" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now run '启动桌面客户端测试.bat' to launch the client." -ForegroundColor Green
Write-Host ""

Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
