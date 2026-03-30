---
phase: 11-conversion-rollout-and-regression-closeout
plan: "04"
status: complete
completed: 2026-03-30
wave: 1
tasks:
  - id: 1
    status: complete
    description: desktop_asr.py — 返回 yt-dlp thumbnail 字段
    commits:
      - hash: f1c19c7f
        message: "fix(phase-11): return yt-dlp thumbnail in url-import task"
  - id: 2
    status: complete
    note: "main.mjs line 735 已有 request?.filePath 优先逻辑，无需修改"
    description: main.mjs — IPC 层显式 filePath 兜底
  - id: 3
    status: complete
    description: UploadPanel.jsx — transcribeDesktopLocalAsr 显式传 filePath
    commits:
      - hash: 9f0b1803
        message: "fix(phase-11): pass filePath explicitly in transcribeLocalMedia"
  - id: 4
    status: complete
    description: UploadPanel.jsx — pollDesktopLinkImportTask 接收并附加 thumbnail
    commits:
      - hash: 46e81d62
        message: "fix(phase-11): attach yt-dlp thumbnail to sourceFile in pollDesktopLinkImportTask"
  - id: 5
    status: complete
    description: UploadPanel.jsx — submitCloudDirectUpload FormData 增加 cover_data_url
    commits:
      - hash: 092813e1
        message: "fix(phase-11): attach cover_data_url to lesson task creation FormData"
  - id: 6
    status: complete
    description: UploadPanel.jsx — fallback 从文件提取封面
    commits:
      - hash: 411e0417
        message: "fix(phase-11): add fallback cover extraction from local file when yt-dlp thumbnail is absent"
key_files:
  created: []
  modified:
    - path: app/api/routers/desktop_asr.py
      change: "_download_media_with_ytdlp" 和 "_run_url_import_task" 返回值增加 "thumbnail" 字段
    - path: desktop-client/electron/main.mjs
      change: 无需修改（line 735 已有 request?.filePath 优先逻辑）
    - path: frontend/src/features/upload/UploadPanel.jsx
      change: "transcribeDesktopLocalAsr" 显式传 filePath；poll 成功时附加 thumbnail 到 sourceFile；FormData 附 cover_data_url；fallback 从文件提取封面
verification:
  grep: "app/api/routers/desktop_asr.py contains 'thumbnail'"
  grep: "desktop-client/electron/main.mjs contains 'request?.filePath'"
  grep: "frontend/src/features/upload/UploadPanel.jsx contains 'filePath: sourcePath'"
  grep: "frontend/src/features/upload/UploadPanel.jsx contains 'payload?.thumbnail'"
  grep: "frontend/src/features/upload/UploadPanel.jsx contains 'cover_data_url'"
  grep: "frontend/src/features/upload/UploadPanel.jsx contains 'materializeDesktopSelectedFile'"
---

## 修复摘要

修复链接转素材流程中两个关键 Bug：

**Bug A（已修复）**：Bottle 1.0 + 链接转素材报错 "Desktop source path is required"
- 根因：`Object.defineProperty` 附加的 `desktopSourcePath` 在 Electron IPC 序列化时丢失
- 修复：`transcribeDesktopLocalAsr` 显式把 `desktopSourcePath` 作为 `filePath` 字段传入；`main.mjs` 已优先读此字段

**Bug B（已修复）**：课程无封面图，无法播放
- 根因：yt-dlp 探测到的 `thumbnail` 未使用；课程创建 FormData 无 `cover_data_url`
- 修复：后端返回 thumbnail → poll 接收并附加到 sourceFile → FormData 传递 → fallback 从文件提取

## 变更文件

- `app/api/routers/desktop_asr.py` — thumbnail 字段返回
- `desktop-client/electron/main.mjs` — 无需修改（已有优先逻辑）
- `frontend/src/features/upload/UploadPanel.jsx` — filePath + thumbnail 全链路
