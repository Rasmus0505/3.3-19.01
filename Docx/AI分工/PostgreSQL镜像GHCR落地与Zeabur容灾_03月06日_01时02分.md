文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：
- 在仓库内落地 PostgreSQL 镜像“先放 GitHub(GHCR) 再给 Zeabur 使用”的可执行方案，覆盖公开 GHCR、私有 GHCR、自定义镜像、双仓库容灾与代理加速的操作路径。
- 保持现有 API 契约不变，不引入复杂服务器运维步骤，保证 Zeabur 一键部署可用。
修改的文件清单（精确路径）：
- .github/workflows/postgres-mirror-ghcr.yml
- .github/workflows/postgres-custom-ghcr.yml
- ops/postgres-custom/Dockerfile
- ops/postgres-custom/initdb/000_readme.sql
- zeabur-template.yaml
- README.md
- docs/ZEABUR_POSTGRES_IMAGE_DEPLOY.md
- Docx/AI分工/PostgreSQL镜像GHCR落地与Zeabur容灾_03月06日_01时02分.md
关联衔接：无
风险：
- 若 GHCR 包设置为 private 但 Zeabur 未配置拉取凭据，PostgreSQL 服务会拉取失败。
- 若未配置 Docker Hub 备份 Secrets（DOCKERHUB_USERNAME/DOCKERHUB_TOKEN/DOCKERHUB_IMAGE），双仓库容灾步骤不会生效。
验证：
- 已完成静态自检：workflow、模板与部署文档已互相对齐（镜像变量、步骤、验证口径一致）。
- 受当前环境限制，未执行线上部署验证；已在文档中固定发布后回归：GET /health=200、POST /api/transcribe/file 上传转写成功。
清理记录：
- 本次未删除任何文档文件：当前任务为新增任务文档，且尚未进入“下一项任务”触发清理阶段。
结束时间：2026-03-06 01:07
