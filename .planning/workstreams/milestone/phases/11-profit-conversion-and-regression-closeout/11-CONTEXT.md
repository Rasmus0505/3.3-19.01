# Phase 11: 盈利转化落地与回归收口 - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

把前面已经锁定的 `Bottle 1.0 / Bottle 2.0` 定位、网页端 CTA 规则、充值恢复动作、桌面端下载引导和示例文案真正落到用户可见表面，并完成整条网页端转化链路与 `app/static` 同步验证。本阶段做的是“转化表达落地 + 回归收口”，不是新增订阅、不是改动 Bottle 边界，也不是再产出一份独立的经营策略文档。

本阶段以 `.planning/workstreams/milestone/ROADMAP.md` 的 Phase 11 为 scope anchor。虽然 `.planning/workstreams/milestone/REQUIREMENTS.md` 的追踪表当前仍把 `ADM-*` 挂在 Phase 11，但 Phase 11 的实现与验证应以前序 Phase 7、9、10 已锁定的转化与命名合同为准。

</domain>

<decisions>
## Implementation Decisions

### 模型卡文案与布局
- **D-01:** Phase 11 不额外添加你未明确要求的副标题、解释段落或引导文案；模型卡按用户给定的文案和布局收口。
- **D-02:** `Bottle 1.0` 卡片固定为两行结构：
  - 第一行：`Bottle 1.0` + `（后台设置的价格）`
  - 第二行：`客户端专属` + `通用素材生成`
- **D-03:** `Bottle 2.0` 卡片固定为三行结构：
  - 第一行：`Bottle 2.0` + `（后台设置的价格）`
  - 第二行：`网站/客户端`
  - 第三行：`更强大的AI模型` + `适合复杂视频`
- **D-04:** 用户侧模型卡继续只显示 `Bottle 1.0 / Bottle 2.0` 主命名，不把技术模型名抬回主表面。

### 受阻场景转化文案
- **D-05:** 余额不足场景使用：
  - 主提示：`余额不足，充值后即可继续生成当前内容`
  - 主按钮：`充值后生成`
  - 次按钮：`稍后再试`
- **D-06:** `Bottle 1.0` 网页不可执行场景使用：
  - 主提示：`Bottle 1.0 仅支持在客户端使用，请下载桌面端继续`
  - 主按钮：`下载桌面端`
  - 次按钮：`我知道了`
- **D-07:** 链接导入场景使用：
  - 主提示：`链接导入仅支持在客户端使用，请下载桌面端继续`
  - 主按钮：`下载桌面端`
  - 次按钮：`继续上传本地文件`
- **D-08:** 大文件 / 长时长 / 复杂视频场景使用明确推荐型文案：
  - 主提示：`当前素材推荐使用客户端生成，效果和稳定性更好`
  - 主按钮：`下载桌面端`
  - 次按钮：`继续生成素材`

### 交付物与回归范围
- **D-09:** Phase 11 不在项目内单独产出“经营建议清单”或新的经营策略文档；这一部分只作为讨论背景，不成为独立交付物。
- **D-10:** Phase 11 的最小回归范围固定包含：
  - 上传页两张模型卡文案和布局正确
  - 余额不足时主按钮必须是 `充值后生成`
  - `Bottle 1.0` 网页不可执行时主按钮必须是 `下载桌面端`
  - 大文件 / 长时长 / 复杂视频时出现已锁定的推荐文案和两个按钮
  - 链接导入时仍然只引导桌面端，不允许网页直接执行
  - 用户侧只显示 `Bottle 1.0 / Bottle 2.0`，不把技术名抬回主表面
  - 修改网页端前端后，必须同步并验证 `app/static`
  - 旧深链不能因为本阶段改动失效

### the agent's Discretion
- 两张模型卡的具体视觉层级、标签样式、留白和响应式排版，只要不改变已锁定文案行数和信息层级。
- “后台设置的价格”在前端实际展示时的格式化方式和对齐方式，只要价格仍取后台配置。
- 各受阻场景中按钮的视觉主次、提示框样式和信息密度。
- `app/static` 验证的具体执行方式和回归记录格式。

### Folded Todos
- 已并入 Phase 11：全局数字输入框默认值为 `0` 时不便于直接清空重输。该问题需要作为本阶段回归收口的一部分处理，优先覆盖价格、充值或其他会影响转化/支付操作流畅度的数字输入场景，并继续保持现有数值校验与规范化。

### Bug 修复：链接转素材关键缺陷
**2026-03-30 新增 — 用户反馈：课程无视频画面，封面图缺失，Bottle 1.0 报错 "Desktop source path is required"**

#### Bug A：Desktop source path is required
**根因**：`transcribeDesktopLocalAsr(UploadPanel.jsx:298)` 调用 `window.desktopRuntime.transcribeLocalMedia({modelKey, file: sourceFile})`，其中 `sourceFile` 是 `buildDesktopSelectedFile` 构建的空 File 对象。`desktopSourcePath` 通过 `Object.defineProperty` 附加，Electron IPC JSON 序列化时丢失。后端 `resolveRequestedSourcePath()` 找不到 path，返回空字符串 → `_resolve_source_path` 报错。

**G-1 决策：IPC 层显式传 filePath（方案 2）**
- 前端 `transcribeDesktopLocalAsr`：从 `sourceFile.desktopSourcePath` 显式提取，传入 `filePath` 字段
- 后端 `resolveRequestedSourcePath`：优先读 `request["filePath"]`
- 影响：所有桌面本地识别场景均受益于显式传参，更健壮

#### Bug B：无封面图 / 课程无法播放
**根因（两条）**：
- **B-1**：`onSelectFile` 调用 `extractMediaCoverPreview(sourceFile)` 时，`sourceFile` 是空 File 对象（无 body），封面提取结果为空。yt-dlp 探测元数据已包含 `thumbnail` 字段，但未返回
- **B-2**：`submitCloudDirectUpload` → `/api/lessons/tasks` FormData 中无 `cover_data_url` 字段

**G-2 决策：利用 yt-dlp `thumbnail` 字段**
- `_run_url_import_task` 完成时在 task 响应中返回 `thumbnail`（来自 yt-dlp JSON 元数据）
- 前端 `pollDesktopLinkImportTask` 接收 `thumbnail` 存入 `sourceFile.thumbnail`
- `prepareDesktopCloudUploadSourceFile` 把 `thumbnail` 随 Blob 传递
- `submitCloudDirectUpload` FormData 增加 `cover_data_url`
- **Fallback**：若 yt-dlp 无 thumbnail（如直链无封面图），链接导入成功后 `materializeDesktopSelectedFile` → `extractMediaCoverPreview` 从已下载文件提取

**已锁定决策**
- Phase 4 / 07.1 已锁定：链接导入走本地 yt-dlp + ffmpeg，不新增服务器下载路径
- Phase 7 已锁定：Bottle 1.0 = 本机 FasterWhisper，Bottle 2.0 = 云端 Qwen
- Phase 4 D-09 已锁定：链接导入成功 → 自动进入生成，不手动确认
- Phase 4 D-21 已锁定：成功完成 → 直接进入学习页
- 封面来源：包含视频封面图（yt-dlp `thumbnail` 字段）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 里程碑合同与阶段边界
- `.planning/PROJECT.md` - v2.1 的产品边界、运行时分层、按次付费方向和网页静态产物交付约束
- `.planning/workstreams/milestone/ROADMAP.md` - Phase 11 的目标与三条计划项，是本阶段的主 scope anchor
- `.planning/workstreams/milestone/REQUIREMENTS.md` - `GROW-01`、`GROW-02` 以及当前 traceability 挂载现状
- `.planning/workstreams/milestone/STATE.md` - 当前里程碑推进状态与前序 phase 连续性

### 前序 phase 已锁定的产品与转化合同
- `.planning/workstreams/milestone/phases/06-product-polish-and-fallbacks/06-CONTEXT.md` - `充值后生成` 已是余额不足恢复动作，不应改写成桌面端能力问题
- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-CONTEXT.md` - Bottle 命名、场景分流、按次付费增长方向
- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-WEB-CTA-SPEC.md` - 网页端不同场景下的主次 CTA 规则
- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-COPY-DECK.md` - 可复用的模型卡、受阻场景、按钮词、Bottle 命名文案
- `.planning/workstreams/milestone/phases/07-competitive-research-and-product-specs/07-PRODUCT-POSITIONING-SPEC.md` - Bottle 标准定位、命名规范、边界与 monetization 总结
- `.planning/workstreams/milestone/phases/09-wordbook-account-and-web-bottle-boundary/09-CONTEXT.md` - 用户侧只保留 Bottle 命名，不把旧技术词抬回前台
- `.planning/workstreams/milestone/phases/10-admin-console-alignment/10-CONTEXT.md` - 管理台主命名与元优先方向，避免前后台口径分裂

### 研究结论
- `.planning/research/SUMMARY.md` - v2.1 对转化、充值和 Bottle 定位的里程碑级总结
- `.planning/research/FEATURES.md` - 场景分流、阻塞动作恢复和按次付费转化模式

### 当前实现入口
- `frontend/src/features/upload/UploadPanel.jsx` - 模型卡、价格、余额阻塞、桌面端引导、大文件推荐和按钮主次逻辑的主入口
- `frontend/src/features/upload/asrStrategy.js` - 云端失败、离线、余额阻塞等受阻消息映射
- `frontend/src/shared/lib/asrModels.js` - 用户侧 Bottle 展示元数据
- `app/static/index.html` - 网页静态入口，Phase 11 必须验证静态产物同步
- `app/static/assets/UploadPanel-DXY7do6S.js` - 当前静态构建中的 UploadPanel 产物，Phase 11 需要在改动后同步更新

### Folded todo
- `.planning/workstreams/milestone/todos/pending/2026-03-28-fix-global-numeric-input-clearing.md` - 已并入 Phase 11 的全局数字输入框体验问题

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/features/upload/UploadPanel.jsx` 已经具备模型卡、价格、余额检查、桌面端引导弹窗、受阻场景和按钮切换能力，Phase 11 主要是在这个入口上收口最终转化表达。
- `frontend/src/features/upload/asrStrategy.js` 已集中处理云端失败、离线和余额不足等文案分流，适合承接受阻提示统一。
- `frontend/src/shared/lib/asrModels.js` 已把 `Bottle 2.0` 作为默认展示名，便于和 UploadPanel 的最终模型卡文案对齐。
- `app/static/` 已存在网页端构建产物，说明本阶段可以明确把“同步并验证静态产物”纳入完成标准，而不是停留在 `frontend/src`。

### Established Patterns
- 当前上传流已经实现了“默认网页路径 + 桌面端推荐 + 余额不足去充值”的基本转化骨架，Phase 11 应该做的是把最终文案和主次动作收口，而不是重新定义规则。
- 前序 phase 已经锁定：用户侧不再暴露技术 model key，`Bottle 1.0` 不能在网页执行，`充值后生成` 是余额恢复动作。
- 当前静态网页是 `frontend/src` 源码与 `app/static` 产物双轨并存，任何网页行为文案改动都必须落到静态产物验证。

### Integration Points
- 在 `UploadPanel.jsx` 中收口两张模型卡的最终文案、布局和价格呈现。
- 在 `UploadPanel.jsx` 与 `asrStrategy.js` 中统一余额不足、桌面端专属、链接导入和复杂素材推荐的最终提示与按钮词。
- 在构建流程后同步 `app/static`，并把 UploadPanel 相关静态资源纳入回归验收。
- 检查与价格、充值或其他关键操作相关的数字输入框交互，避免默认 `0` 阻碍重新输入。

</code_context>

<specifics>
## Specific Ideas

- 模型卡只按用户给定文案和布局实现，不额外加副标题。
- `Bottle 1.0` 卡片：
  - `Bottle 1.0` + `（后台设置的价格）`
  - `客户端专属` + `通用素材生成`
- `Bottle 2.0` 卡片：
  - `Bottle 2.0` + `（后台设置的价格）`
  - `网站/客户端`
  - `更强大的AI模型` + `适合复杂视频`
- 大文件 / 长时长 / 复杂视频的主提示固定为：`当前素材推荐使用客户端生成，效果和稳定性更好`
- 本阶段不新建“经营建议清单”文档

### Bug 修复：链接转素材关键缺陷

#### Bug A 修复（6 个文件）
1. `app/api/routers/desktop_asr.py` — `_run_url_import_task` 返回 `thumbnail` 字段（来自 yt-dlp JSON `metadata.thumbnail`）
2. `desktop-client/electron/main.mjs` — `resolveRequestedSourcePath` 增加优先读 `request.filePath` 逻辑
3. `frontend/src/features/upload/UploadPanel.jsx` — `transcribeDesktopLocalAsr` 调用时传入 `filePath: String(sourceFile?.desktopSourcePath || "").trim()`
4. `frontend/src/features/upload/UploadPanel.jsx` — `pollDesktopLinkImportTask` 接收 `thumbnail` 存入 `sourceFile.thumbnail`
5. `frontend/src/features/upload/UploadPanel.jsx` — `prepareDesktopCloudUploadSourceFile` 把 `thumbnail` 传递到新构建的 Blob File 对象
6. `frontend/src/features/upload/UploadPanel.jsx` — `submitCloudDirectUpload` FormData 增加 `cover_data_url`

#### Bug B Fallback（当 yt-dlp 无 thumbnail 时）
- 链接导入成功后，`onSelectFile` 调用时如果 `sourceFile.thumbnail` 存在则直接使用
- 否则走 `materializeDesktopSelectedFile` → `extractMediaCoverPreview` 从已下载文件提取

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope after folding the numeric-input todo into this phase.

</deferred>

---

*Phase: 11-conversion-rollout-and-regression-closeout*
*Context gathered: 2026-03-29*
