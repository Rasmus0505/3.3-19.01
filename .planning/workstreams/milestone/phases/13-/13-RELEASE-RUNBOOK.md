# Phase 13 Release Runbook

## 目的

把 Phase 13 已经完成的代码能力，转成你或运营同学可以实际执行的一套 Windows 桌面发布流程。

这个 runbook 覆盖：
- preview 内测包发布
- stable 正式包发布
- 官网 release metadata 部署
- 发布后手工验证

不覆盖：
- Phase 14 的程序内自动更新执行
- 更复杂的 staged rollout / forced update

---

## 一次发布的产物

一次完整桌面发布至少有 4 类产物：

1. Windows 安装包
2. release metadata
3. 官网下载页可读取的 release registry
4. 发布验证记录

本仓库里对应关系如下：

- 安装包：`desktop-client/dist/` 下的 `.exe`
- 单 channel metadata：`desktop-client/dist/release/{channel}.json`
- 总 registry：`desktop-client/dist/release/desktop-releases.json`
- 手工验证清单：`13-RELEASE-CHECKLIST.md`

---

## 必备环境变量

### 所有发布都需要

PowerShell:

```powershell
$env:DESKTOP_RELEASE_VERSION="2.2.0"
$env:DESKTOP_RELEASE_APP_URL="https://你的正式网站域名"
$env:DESKTOP_RELEASE_API_BASE_URL="https://你的正式网站域名"
$env:DESKTOP_RELEASE_NOTES="这里写本次桌面版本的更新说明摘要"
```

说明：
- `DESKTOP_RELEASE_VERSION`
  - 例：`2.2.0`
- `DESKTOP_RELEASE_APP_URL`
  - 用于生成官网 `/download/desktop` 入口
- `DESKTOP_RELEASE_API_BASE_URL`
  - 用于生成 `/desktop/client/channels/*.json` metadata URL
- `DESKTOP_RELEASE_NOTES`
  - 写进 release record，也会显示在官网下载页

### 仅 stable 正式包需要

PowerShell:

```powershell
$env:DESKTOP_SIGN_CERT_FILE="D:\\certs\\bottle-desktop.pfx"
$env:DESKTOP_SIGN_CERT_PASSWORD="你的证书密码"
```

可选：

```powershell
$env:DESKTOP_SIGN_CERT_SUBJECT_NAME="你的证书主题名"
```

说明：
- `stable` 发布如果没有证书路径和密码，`release-win.mjs` 会直接失败
- `preview` 发布不要求签名

---

## Preview 发布

适用场景：
- 内部测试
- 小范围体验验证
- 不希望影响普通用户默认下载路径

执行命令：

```powershell
$env:DESKTOP_RELEASE_VERSION="2.2.0-preview.1"
$env:DESKTOP_RELEASE_APP_URL="https://你的网站域名"
$env:DESKTOP_RELEASE_API_BASE_URL="https://你的网站域名"
$env:DESKTOP_RELEASE_NOTES="Preview build for internal validation"
node .\desktop-client\scripts\release-win.mjs --channel preview --target nsis
```

执行后重点检查：
- `desktop-client/dist/release/preview.json`
- `desktop-client/dist/release/desktop-releases.json`
- `desktop-client/dist/` 里的 preview 安装包

发布后原则：
- preview 只给内部或测试用户
- 不要把 preview 设成官网默认下载入口

---

## Stable 正式发布

适用场景：
- 面向真实用户
- 官网默认下载入口
- 后续客户端默认版本真相

执行命令：

```powershell
$env:DESKTOP_RELEASE_VERSION="2.2.0"
$env:DESKTOP_RELEASE_APP_URL="https://你的网站域名"
$env:DESKTOP_RELEASE_API_BASE_URL="https://你的网站域名"
$env:DESKTOP_RELEASE_NOTES="Bottle 桌面端首个正式发布版本"
$env:DESKTOP_SIGN_CERT_FILE="D:\\certs\\bottle-desktop.pfx"
$env:DESKTOP_SIGN_CERT_PASSWORD="你的证书密码"
node .\desktop-client\scripts\release-win.mjs --channel stable --target nsis
```

执行后重点检查：
- `desktop-client/dist/release/stable.json`
- `desktop-client/dist/release/desktop-releases.json`
- stable 安装包是否已签名

---

## 官网部署步骤

`release-win.mjs` 只会在本地生成 release metadata，不会自动替你部署到网站。

你需要做 2 件事：

1. 上传安装包到你的正式下载位置
2. 让服务端能读取 `desktop-releases.json`

### 安装包部署

你需要把生成的 `.exe` 上传到你控制的正式下载位置，例如：
- 对象存储/CDN
- 网站静态文件目录
- 反向代理后的下载目录

要求：
- stable 与 preview 地址分开
- 官网默认只展示 stable

### release registry 部署

后端现在通过环境变量读取 release registry：

```powershell
$env:DESKTOP_CLIENT_RELEASES_FILE="D:\\deploy\\desktop-releases.json"
```

因此正式部署时你需要：
- 把 `desktop-client/dist/release/desktop-releases.json` 放到服务端
- 在服务端设置 `DESKTOP_CLIENT_RELEASES_FILE`
- 重启应用进程

如果你更喜欢直接用 JSON 环境变量，也可以改用：

```powershell
$env:DESKTOP_CLIENT_RELEASES_JSON="...完整 JSON 字符串..."
```

但正式环境更推荐文件方式，便于维护和回滚。

---

## 发布后验证顺序

按下面顺序验证，效率最高：

1. 打开：
   - `/desktop/client/latest.json`
   - `/desktop/client/channels/stable.json`
   - `/desktop/client/channels/preview.json`
2. 打开：
   - `/download/desktop`
3. 确认官网默认展示 stable
4. 下载 stable 安装包
5. 检查签名
6. 安装并确认安装器没有出现：
   - `model`
   - `helper`
   - `ffmpeg`
   - `yt-dlp`
7. 打开客户端，确认其 release 诊断仍指向 stable
8. 再单独验证 preview 不会污染默认入口

手工检查时直接对照：
- `13-RELEASE-CHECKLIST.md`

---

## 回滚思路

如果 stable 发布后发现问题：

1. 先不要删除旧安装包
2. 把服务端 `desktop-releases.json` 中的 stable 记录回滚到上一版
3. 保留有问题的安装包文件，但从 release registry 中移除默认指向
4. 重新加载服务

这样官网和客户端读取的“默认最新版本”会先恢复正常。

---

## 当前已知限制

- 当前客户端程序更新仍然是“检查 metadata + 打开下载链接”，不是程序内自动更新执行
- 真实 Windows 签名是否通过，仍然取决于你的证书和本机签名环境
- 官网 release registry 目前是文件/环境变量驱动，不是后台管理台驱动

这些都属于当前 Phase 13 边界内的合理状态。

---

## 本阶段完成标准

当下面 4 件事都成立时，可以认为 Phase 13 基本完成：

1. stable 包能通过 `release-win.mjs` 正常产出
2. stable 包已签名
3. 官网 `/download/desktop` 与 release metadata 正常读取 stable
4. `13-RELEASE-CHECKLIST.md` 全部走完
