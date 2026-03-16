文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：将主应用 Dockerfile 调整为不依赖启动脚本，直接使用 uvicorn 启动 FastAPI，并保持 Zeabur 部署端口为 8080。
修改的文件清单（精确路径）：
- Dockerfile
- Docx/AI分工/改为直接启动FastAPI的Dockerfile_03月16日_14时00分.md
关联衔接：无
风险：
- 本次仅调整容器启动链路，未改动应用代码；若仍需手动迁移数据库，部署后仍要按现有流程执行。
验证：
- 已执行 `git diff -- Dockerfile`，确认已移除 `COPY scripts ./scripts`、`chmod +x /app/scripts/start.sh` 与 `CMD ["sh", "/app/scripts/start.sh"]`。
- 已执行 `rg -n "start\\.sh|uvicorn|ENV PORT|EXPOSE" Dockerfile`，确认 Dockerfile 仅保留 `ENV PORT=8080`、`EXPOSE 8080` 与 `uvicorn` 直接启动命令。
- 已尝试执行 `Get-Command docker`，当前环境未安装 Docker，无法进行镜像构建级验证。
清理记录：
- 未删除任何分工文档：当前仅新增本任务文档用于留痕；且按“文件删除需经过用户确认”规则，本轮不执行删除。
结束时间：2026-03-16 14:01:39
