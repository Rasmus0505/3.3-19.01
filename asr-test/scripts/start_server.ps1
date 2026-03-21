Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
python -m uvicorn server:app --host 127.0.0.1 --port 8091 --reload
