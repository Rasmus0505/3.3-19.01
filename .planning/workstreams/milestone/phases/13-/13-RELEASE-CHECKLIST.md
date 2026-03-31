# Phase 13 Release Checklist

## 官网下载页

- [ ] 访问 `/download/desktop` 时能看到 Bottle 官方桌面下载页，而不是占位跳转页
- [ ] 页面明确展示 stable 版本号、发布时间、更新说明摘要
- [ ] 页面主下载动作指向 stable 安装包

## Release Metadata

- [ ] `GET /desktop/client/latest.json` 返回 stable 版本信息
- [ ] `GET /desktop/client/channels/stable.json` 返回 stable release record
- [ ] `GET /desktop/client/channels/preview.json` 返回 preview release record（如已配置）
- [ ] release metadata 中包含 `channel`、`version`、`releaseName`、`entryUrl`

## Stable / Preview 分流

- [ ] 默认官网入口只把普通用户带到 `stable`
- [ ] `preview` 仅作为内部测试渠道展示，不替代 stable 主入口
- [ ] 打包后的 stable 客户端默认读取 stable metadata
- [ ] 打包后的 preview 客户端默认读取 preview metadata

## Windows 安装与签名

- [ ] stable 发布通过正式 `release-win` 流程产出，而不是手工拼装
- [ ] stable 发布记录中明确标记需要 `签名`
- [ ] stable 安装包文件属性/签名验证通过
- [ ] preview 如用于内部验证，可不要求签名，但不得冒充 stable

## 正式安装器体验

- [ ] 安装器默认是 `完整安装`
- [ ] 安装器不出现 `model / helper / ffmpeg / yt-dlp`
- [ ] 安装完成后写出 `desktop-install-state.json`
- [ ] 安装后的 Bottle 1.0 本地资源可直接使用，不要求用户二次理解或手动准备运行资产
