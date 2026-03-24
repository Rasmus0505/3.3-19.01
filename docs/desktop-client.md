# 桌面客户端更新检测

## 当前链路

- 桌面客户端启动时会读取 `desktop-runtime.json` 中的 `cloud.appBaseUrl` 与 `clientUpdate` 配置。
- 如果没有显式填写 `clientUpdate.metadataUrl`，客户端会按 `cloud.appBaseUrl + /desktop/client/latest.json` 推导更新元数据地址。
- 客户端主进程会请求更新元数据，并以 `x-bottle-client-version` 请求头上传当前客户端版本号。
- 当服务端返回的 `latestVersion` 高于当前客户端版本时，Electron 主进程会通过 `Notification` 弹出更新提醒；点击通知会打开 `entryUrl`。

## 服务端端点

应用现在提供两个兼容端点：

- `/desktop/client/latest.json`
- `/desktop-client-version.json`

返回字段兼容 Electron `extractDesktopClientRelease()` 逻辑：

```json
{
  "latestVersion": "0.3.1",
  "entryUrl": "https://your-domain.example/download/desktop",
  "releaseNotes": "修复上传诊断与更新检测链路。",
  "releaseName": "Bottle Desktop 0.3.1",
  "publishedAt": "2026-03-24T20:30:00+08:00"
}
```

如果服务端还没有配置正式发布信息，端点仍会返回可解析 JSON，但会把 `latestVersion` 回落为请求头中的当前客户端版本或 `0.0.0`，这样旧客户端不会被误判为必须升级。

## Zeabur 配置

在 Zeabur 对应服务中配置这些环境变量，然后重新部署：

- `DESKTOP_CLIENT_LATEST_VERSION`
  当前线上可下载的桌面客户端版本，例如 `0.3.1`
- `DESKTOP_CLIENT_ENTRY_URL`
  用户点击更新通知后打开的地址，建议填实际安装包下载页、GitHub Release 页或对象存储下载地址
- `DESKTOP_CLIENT_RELEASE_NOTES`
  可选，更新说明
- `DESKTOP_CLIENT_RELEASE_NAME`
  可选，版本名称
- `DESKTOP_CLIENT_PUBLISHED_AT`
  可选，发布时间，建议使用 ISO 8601

可选兼容变量：

- `DESKTOP_CLIENT_DOWNLOAD_URL`
- `DESKTOP_CLIENT_UPDATE_ENTRY_URL`
- `DESKTOP_CLIENT_UPDATE_DOWNLOAD_URL`

如果没有配置 `DESKTOP_CLIENT_ENTRY_URL`，服务端仍会提供 `/download/desktop` 入口。该入口会提示你补充配置，而不是返回 404。

## 客户端配置

- 打包时可通过 `DESKTOP_CLIENT_UPDATE_METADATA_URL` 或 `DESKTOP_CLIENT_UPDATE_MANIFEST_URL` 覆盖默认元数据地址。
- 打包时可通过 `DESKTOP_CLIENT_UPDATE_ENTRY_URL` 或 `DESKTOP_CLIENT_UPDATE_DOWNLOAD_URL` 覆盖默认更新入口地址。
- 若不覆盖，运行时会优先使用本地 `desktop-runtime.json` 中的 `clientUpdate` 字段；否则根据 `cloud.appBaseUrl` 自动推导。

## 发布新客户端的建议步骤

1. 先构建并上传新的桌面安装包。
2. 记录该安装包对应的版本号，例如 `0.3.1`。
3. 在 Zeabur 更新 `DESKTOP_CLIENT_LATEST_VERSION` 与 `DESKTOP_CLIENT_ENTRY_URL`。
4. 如需展示更新说明，再补充 `DESKTOP_CLIENT_RELEASE_NOTES`、`DESKTOP_CLIENT_RELEASE_NAME`、`DESKTOP_CLIENT_PUBLISHED_AT`。
5. 触发 Zeabur 重部署。
6. 旧客户端重启后会自动检查；若前端诊断面板已经接入 `desktop:check-client-update`，也可以手动点“检查更新”立即验证。

## 验证方法

1. 启动服务后访问 `/desktop/client/latest.json`，确认返回 JSON。
2. 用旧版本客户端启动并确认其 `cloud.appBaseUrl` 指向当前网站域名。
3. 若 `DESKTOP_CLIENT_LATEST_VERSION` 大于旧客户端版本，应看到系统通知。
4. 点击通知后应打开 `DESKTOP_CLIENT_ENTRY_URL`；如果未配置，则会打开 `/download/desktop` 并显示补充配置说明。

## 验收边界说明

- “诊断面板中的手动检查更新按钮”依赖前端界面消费现有 IPC：`desktop:check-client-update`。
- 本任务未修改前端文件；当前只保证 Electron 主进程和 preload 暴露的更新检查能力可供前端接入。
