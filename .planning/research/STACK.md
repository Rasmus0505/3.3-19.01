# 技术栈研究

**Project:** Bottle 英语学习产品
**Context:** 在现有 FastAPI + React + Electron 产品基础上做 brownfield 优化
**Confidence:** 对当前代码方向 HIGH，对后续产品权衡 MEDIUM

## 推荐方向

- 维持当前的总体分层：FastAPI 后端 + 共享 React 前端 + Electron 桌面壳。
- 保持桌面端作为完整能力运行时，承载本地媒体工具链。
- 保持网页端聚焦浏览器环境下稳定可用的云端生成能力。
- 除非某项重构能直接降低服务器负担或显著减少用户摩擦，否则不建议做大规模架构重写。

## 核心技术

- FastAPI + SQLAlchemy + Alembic：承载 API、持久化、计费与运营控制
- React + Vite + Zustand：承载 Web / Desktop 共享产品界面
- Electron：承载桌面端完整能力和本地 runtime bridge
- ffmpeg / ffprobe 与 yt-dlp：放在桌面端承载本地媒体处理和链接导入
- DashScope 云端 ASR：作为 Bottle 2.0
- faster-whisper 本地 bundle：作为 Bottle 1.0

## 不建议的方向

- 不要默认把重媒体转换搬到中心服务器。
- 不要要求终端用户自己管理 ASR 密钥。
- 不要为了“网页端完全一致”而强行把本地工具链能力塞进浏览器。

## 含义

最优路径是继续围绕现有技术栈做产品边界和运行时职责收敛，而不是推倒重来。