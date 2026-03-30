# Launch Desktop Client for Testing
# 双击此脚本启动桌面客户端

$DesktopExe = "d:\3.3-19.01\desktop-client\dist-fixed\win-unpacked\Bottle.exe"

if (-not (Test-Path $DesktopExe)) {
    Write-Host "错误：找不到桌面客户端可执行文件" -ForegroundColor Red
    Write-Host "位置: $DesktopExe" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "请先运行 update-desktop-client.ps1 更新客户端" -ForegroundColor Cyan
    Write-Host ""
    pause
    exit 1
}

Write-Host "正在启动桌面客户端..." -ForegroundColor Cyan
Write-Host "测试账号: root@qq.com / 123123" -ForegroundColor Yellow
Write-Host ""
Write-Host "测试步骤：" -ForegroundColor Green
Write-Host "1. 使用 root@qq.com 登录" -ForegroundColor White
Write-Host "2. 选择链接导入模式" -ForegroundColor White
Write-Host "3. 粘贴 B站视频链接" -ForegroundColor White
Write-Host "4. 选择 Bottle 1.0 模型生成课程" -ForegroundColor White
Write-Host ""
Write-Host "启动中..." -ForegroundColor Cyan

& $DesktopExe --disable-gpu --no-sandbox