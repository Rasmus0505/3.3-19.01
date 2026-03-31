$env:DESKTOP_RELEASE_VERSION="2.2.0-preview.1"
$env:DESKTOP_RELEASE_APP_URL="https://351636.preview.aliyun-zeabur.cn"
$env:DESKTOP_RELEASE_API_BASE_URL="https://351636.preview.aliyun-zeabur.cn"
$env:DESKTOP_RELEASE_NOTES="Preview build for internal validation"

node .\desktop-client\scripts\release-win.mjs --channel preview --target nsis
