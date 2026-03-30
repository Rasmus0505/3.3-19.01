# Desktop Client Update Script
# 双击此脚本以更新桌面客户端打包内容

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $ProjectRoot "frontend"
$DesktopDir = Join-Path $ProjectRoot "desktop-client"
$CacheFrontendDist = "$DesktopDir\dist-fixed\win-unpacked\resources\app.asar.unpacked\.cache\frontend-dist"

Write-Host "=== 开始桌面客户端更新流程 ===" -ForegroundColor Cyan

# Step 1: Build frontend
Write-Host "`n[1/4] 构建前端..." -ForegroundColor Yellow
Push-Location $FrontendDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
    Write-Host "前端构建成功" -ForegroundColor Green
} finally {
    Pop-Location
}

# Step 2: Backup old assets
Write-Host "`n[2/4] 备份旧资源..." -ForegroundColor Yellow
$BackupDir = "$CacheFrontendDist\..\frontend-dist-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
if (Test-Path $CacheFrontendDist) {
    Copy-Item -Path $CacheFrontendDist -Destination $BackupDir -Recurse -Force
    Write-Host "已备份到: $BackupDir" -ForegroundColor Green
}

# Step 3: Copy new assets
Write-Host "`n[3/4] 复制新资源到桌面客户端..." -ForegroundColor Yellow
$NewDistDir = Join-Path $FrontendDir "dist"
if (Test-Path $NewDistDir) {
    # Clean old assets
    if (Test-Path $CacheFrontendDist) {
        Remove-Item -Path $CacheFrontendDist -Recurse -Force
    }
    # Copy new assets
    Copy-Item -Path $NewDistDir -Destination $CacheFrontendDist -Recurse -Force
    Write-Host "资源复制完成" -ForegroundColor Green
} else {
    throw "Frontend dist not found at $NewDistDir"
}

# Step 4: Done
Write-Host "`n[4/4] 更新完成!" -ForegroundColor Green
Write-Host ""
Write-Host "前端构建已更新到桌面客户端" -ForegroundColor Cyan
Write-Host "资源位置: $CacheFrontendDist" -ForegroundColor Cyan
Write-Host ""
Write-Host "现在可以启动桌面客户端进行测试" -ForegroundColor Green
Write-Host ""

# Pause for review
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")