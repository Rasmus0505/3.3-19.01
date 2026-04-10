from __future__ import annotations

import ast
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ROUTERS_ROOT = PROJECT_ROOT / "app" / "api" / "routers"
REPOSITORIES_ROOT = PROJECT_ROOT / "app" / "repositories"
FRONTEND_ROOT = PROJECT_ROOT / "frontend" / "src"

DISALLOWED_DUPLICATE_ROUTER_FILES = (
    "auth.py",
    "billing.py",
    "wallet.py",
    "lessons.py",
    "admin_console.py",
    "admin_sql_console.py",
)

DISALLOWED_FRONTEND_WRAPPERS = (
    "app/LearningShell.js",
    "features/auth/AuthPanel.jsx",
    "features/wallet/WalletBadge.jsx",
    "features/wallet/RedeemCodePanel.jsx",
    "features/lessons/components/LessonList.jsx",
    "features/lessons/components/LessonListLocalSubtitles.jsx",
)


def _iter_python_files(root: Path) -> list[Path]:
    return [path for path in root.rglob("*.py") if path.is_file()]


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def test_router_packages_do_not_keep_duplicate_top_level_router_files():
    present = [name for name in DISALLOWED_DUPLICATE_ROUTER_FILES if (ROUTERS_ROOT / name).exists()]
    assert not present, f"Duplicate top-level router files should be removed: {present}"


def test_admin_router_uses_package_router_file():
    assert (ROUTERS_ROOT / "admin" / "router.py").exists()
    assert not (ROUTERS_ROOT / "admin.py").exists()


def test_repositories_do_not_import_services():
    offenders: list[str] = []
    for path in _iter_python_files(REPOSITORIES_ROOT):
        modules = _imported_modules(path)
        if any(module == "app.services" or module.startswith("app.services.") for module in modules):
            offenders.append(path.relative_to(PROJECT_ROOT).as_posix())
    assert not offenders, f"Repositories must not import services: {offenders}"


def test_frontend_does_not_restore_deleted_wrapper_files():
    restored = [relative_path for relative_path in DISALLOWED_FRONTEND_WRAPPERS if (FRONTEND_ROOT / relative_path).exists()]
    assert not restored, f"Frontend wrapper files should stay removed: {restored}"


def test_learning_shell_uses_canonical_lesson_list_entry():
    panel_content = (FRONTEND_ROOT / "app" / "learning-shell" / "LearningShellPanelContent.jsx").read_text(encoding="utf-8")
    assert "../../features/lessons/LessonList" in panel_content
    assert "../../features/lessons/components/LessonList" not in panel_content
