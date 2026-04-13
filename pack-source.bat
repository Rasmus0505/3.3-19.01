@echo off
setlocal

cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo git is not installed or not in PATH.
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo This folder is not a git repository.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$root = (Resolve-Path '.').Path;" ^
  "$zipName = 'source-clean-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip';" ^
  "$zipPath = Join-Path $root $zipName;" ^
  "$stageBase = Join-Path $env:TEMP ('source-clean-' + [guid]::NewGuid().ToString());" ^
  "$pkgRoot = Join-Path $stageBase '3.3-19.01-source';" ^
  "$includeDirs = @('app','frontend','admin-web','alembic','migrations','config','scripts','tests');" ^
  "$includeFiles = @('README.md','Dockerfile','requirements.txt','requirements-dev.txt','alembic.ini','pytest.ini','.dockerignore','.gitignore','.gitmodules');" ^
  "$excludeDirNames = @('__pycache__','node_modules','dist','dist-admin','.planning','.pytest_cache','.git','.vscode','tmp','tmp-admin-verify','tmp-admin-verify-2','output','Docx','Claude','tools','.claude','.cursor','.codebuddy','.desktop-runtime','.playwright-cli','.playwright-mcp','.workbuddy','.worktrees','.zeabur','static');" ^
  "$excludeFilePatterns = @('\.bak$','\.db$','\.log$','\.zip$','(^|\\)\.env($|\\.|$)','(^|\\)\.env\.local$','(^|\\)\.env\.development$','(^|\\)\.env\.production$');" ^
  "if (Test-Path -LiteralPath $stageBase) { Remove-Item -LiteralPath $stageBase -Recurse -Force }" ^
  "New-Item -ItemType Directory -Path $pkgRoot | Out-Null;" ^
  "foreach ($file in $includeFiles) {" ^
  "  $src = Join-Path $root $file;" ^
  "  if (Test-Path -LiteralPath $src -PathType Leaf) {" ^
  "    $dst = Join-Path $pkgRoot $file;" ^
  "    $dstDir = Split-Path -Parent $dst;" ^
  "    if ($dstDir -and -not (Test-Path -LiteralPath $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }" ^
  "    Copy-Item -LiteralPath $src -Destination $dst -Force;" ^
  "  }" ^
  "}" ^
  "foreach ($dir in $includeDirs) {" ^
  "  $srcDir = Join-Path $root $dir;" ^
  "  if (-not (Test-Path -LiteralPath $srcDir -PathType Container)) { continue }" ^
  "  Get-ChildItem -LiteralPath $srcDir -Recurse -Force | Where-Object { -not $_.PSIsContainer } | Where-Object {" ^
  "    $full = $_.FullName;" ^
  "    $rel = $full.Substring($root.Length).TrimStart('\');" ^
  "    $parts = $rel.Split('\');" ^
  "    $name = $_.Name;" ^
  "    -not ($parts | Where-Object { $excludeDirNames -contains $_ }) -and -not ($excludeFilePatterns | Where-Object { $rel -match $_ -or $name -match $_ })" ^
  "  } | ForEach-Object {" ^
  "    $rel = $_.FullName.Substring($root.Length).TrimStart('\');" ^
  "    $dst = Join-Path $pkgRoot $rel;" ^
  "    $dstDir = Split-Path -Parent $dst;" ^
  "    if ($dstDir -and -not (Test-Path -LiteralPath $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }" ^
  "    Copy-Item -LiteralPath $_.FullName -Destination $dst -Force;" ^
  "  }" ^
  "}" ^
  "if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }" ^
  "Add-Type -AssemblyName System.IO.Compression.FileSystem;" ^
  "[System.IO.Compression.ZipFile]::CreateFromDirectory($stageBase, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false);" ^
  "Remove-Item -LiteralPath $stageBase -Recurse -Force;" ^
  "Write-Host ('Created ' + $zipPath);"

if errorlevel 1 (
  echo Failed to create source archive.
  exit /b 1
)

echo Done.
exit /b 0
