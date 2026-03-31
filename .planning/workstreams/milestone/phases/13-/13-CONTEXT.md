# Phase 13: 桌面发布管线与签名安装包 - Context

**Gathered:** 2026-03-31
**Updated:** 2026-04-01
**Status:** Revised for stable-only distribution

<domain>
## Phase Boundary

把当前 Electron 桌面工程从“能打包”提升到“能正式对外发布”。

当前修订后的 Phase 13 目标是：
- 产出可追溯的 stable Windows 官方安装包
- 保留 stable release metadata 作为桌面更新与发布记录来源
- 把网站统一下载入口 `/download/desktop` 改为跳转到稳定的 Feijipan 下载地址
- 去掉 preview 作为公开或受支持的 Phase 13 发布面

不包含：
- 程序内自动更新执行
- 模型增量更新体验
- preview/internal 渠道产品化

</domain>

<decisions>
## Implementation Decisions

### 官方下载入口
- **D-01:** `/download/desktop` 继续作为网站唯一官方桌面入口。
- **D-02:** `/download/desktop` 不再渲染下载页，而是直接跳转到 stable Feijipan 链接。
- **D-03:** 网页端所有桌面 CTA 仍指向 `/download/desktop`，不直接散落第三方地址。
- **D-04:** 当前 canonical stable 下载地址为 `https://share.feijipan.com/s/1n2mH6fh`。

### Release Metadata
- **D-05:** 保留 `GET /desktop/client/latest.json` 和 `GET /desktop/client/channels/stable.json`。
- **D-06:** stable metadata 的 `entryUrl` 应与 Feijipan stable 下载地址一致。
- **D-07:** `GET /desktop/client/channels/preview.json` 在本阶段不再受支持，应返回 `404`。

### Release Pipeline
- **D-08:** `release-win.mjs` 继续存在，但只支持 stable 发布。
- **D-09:** stable 发布记录仍必须包含签名要求与产物追踪。
- **D-10:** 生成的 `desktop-releases.json` 仅保留 stable 记录，不再写 preview。

### Installer Experience
- **D-11:** 安装器继续默认完整安装。
- **D-12:** 安装器继续隐藏 `model`、`helper`、`ffmpeg`、`yt-dlp` 等技术选项。
- **D-13:** `desktop-install-state.json` 继续作为安装状态持久化契约。

</decisions>

<canonical_refs>
## Canonical References

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `app/main.py`
- `desktop-client/scripts/package-win.mjs`
- `desktop-client/scripts/write-runtime-defaults.mjs`
- `desktop-client/scripts/release-win.mjs`
- `frontend/src/features/upload/UploadPanel.jsx`
- `tests/contracts/test_desktop_release_surface_contract.py`
- `tests/contracts/test_desktop_installer_contract.py`
- `tests/contracts/test_desktop_runtime_contract.py`

</canonical_refs>

<code_context>
## Existing Code Insights

- 网站侧已经有统一的桌面 CTA，可继续复用 `/download/desktop`。
- 桌面客户端已经有读取 release metadata 和打开下载入口的能力，不需要在 Phase 13 改成程序内自动更新。
- 当前安装器 contract 已经满足“完整安装 + 隐藏技术选项”的正式版方向，本次不需要回退这部分。

</code_context>

<specifics>
## Specific Ideas

- 用户明确要求删除自建下载页，改成站内入口直接跳转小飞机网盘。
- 用户明确要求 Phase 13 改成 stable-only，不再保留 preview 支持面。
- UAT 需要在这次 stable-only 重构完成后再恢复。

</specifics>

<deferred>
## Deferred Ideas

- preview/internal 分发恢复
- 程序内自动更新执行
- staged rollout / forced update
- 模型增量更新体验

</deferred>

---

*Phase: 13-desktop-release-pipeline-and-signed-installer*
*Context updated: 2026-04-01*
