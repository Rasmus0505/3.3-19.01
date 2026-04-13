#!/usr/bin/env bash
# git-ai-commit 安装脚本
# 功能：将 prepare-commit-msg hook 安装到当前仓库，并引导用户配置各 AI 的身份

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SOURCE="$SCRIPT_DIR/prepare-commit-msg"
HOOK_TARGET="$(pwd)/.git/hooks/prepare-commit-msg"

if [[ ! -f "$HOOK_SOURCE" ]]; then
    echo "错误：找不到 hook 源文件：$HOOK_SOURCE"
    exit 1
fi

# 检测是否在 git 仓库中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "错误：请在 Git 仓库根目录运行此脚本"
    exit 1
fi

# 备份已有 hook
if [[ -f "$HOOK_TARGET" ]]; then
    BACKUP="$HOOK_TARGET.bak.$(date +%Y%m%d_%H%M%S)"
    cp "$HOOK_TARGET" "$BACKUP"
    echo "已备份旧 hook → $BACKUP"
fi

# 安装 hook
cp "$HOOK_SOURCE" "$HOOK_TARGET"
chmod +x "$HOOK_TARGET"
echo "✓ hook 已安装 → $HOOK_TARGET"

echo ""
echo "下一步：为每个 AI 配置身份标记（选一种方式）"
echo ""
echo "方式 A - 为当前用户配置全局 AI 身份："
echo "  git config --global user.ai-label 'Claude'
  git config --global user.ai-source 'claude-desktop'
  git config --global user.ai-model 'claude-4-opus'
"
echo "方式 B - 为不同 AI 创建独立命令别名（在 ~/.bashrc 或 ~/.zshrc 中）："
echo "  alias git-claude='GIT_AI_LABEL=Claude GIT_AI_SOURCE=claude GIT_AI_MODEL=claude-4 git'
  alias git-cursor='GIT_AI_LABEL=Cursor GIT_AI_SOURCE=cursor GIT_AI_MODEL=o4 git'
  alias git-windsurf='GIT_AI_LABEL=Windsurf GIT_AI_SOURCE=windsurf GIT_AI_MODEL=wind-ai git'
echo ""
echo "方式 C - 使用 AI 生成 commit message（需要 AI 命令行工具）："
echo "  git config --global user.ai-cmd 'claude --print'
  # 或
  git config --global user.ai-cmd 'cursor --commit'
  # 或
  git config --global user.ai-cmd 'windsurf -m'
echo ""
echo "安装完成！"
