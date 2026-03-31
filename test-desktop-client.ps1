# Launch Desktop Client for Testing
# Usage: right-click -> "Run with PowerShell"
#   OR double-click "启动桌面客户端测试.bat" in the same folder

$DesktopExe = "d:\3.3-19.01\desktop-client\dist-fixed\win-unpacked\Bottle.exe"

if (-not (Test-Path $DesktopExe)) {
    Write-Host "[ERROR] Desktop client executable not found." -ForegroundColor Red
    Write-Host "  Path: $DesktopExe" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please run '更新桌面客户端前端.bat' first." -ForegroundColor Cyan
    Write-Host ""
    pause
    exit 1
}

Write-Host "Launching Desktop Client..." -ForegroundColor Cyan
Write-Host "Test account: root@qq.com / 123123" -ForegroundColor Yellow
Write-Host ""
Write-Host "Test steps:" -ForegroundColor Green
Write-Host "  1. Login with root@qq.com" -ForegroundColor White
Write-Host "  2. Choose URL import mode" -ForegroundColor White
Write-Host "  3. Paste a Bilibili video URL" -ForegroundColor White
Write-Host "  4. Select Bottle 1.0 model and generate course" -ForegroundColor White
Write-Host ""
Write-Host "Starting..." -ForegroundColor Cyan

& $DesktopExe --disable-gpu --no-sandbox
