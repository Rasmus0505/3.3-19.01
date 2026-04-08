# app/api/routers/admin/ intentionally has no router re-export.
# The sub-package router.py is a legacy parallel copy and should not be imported here.
# Code that needs the admin router should import via:
#   from app.api.routers import admin          # gives the APIRouter directly
# NOT:
#   from app.api.routers.admin import router   # goes to sub-package, not top-level admin.py


def __getattr__(name: str):
    if name != "router":
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    import sys
    from importlib.util import spec_from_file_location, module_from_spec
    from pathlib import Path

    # admin/ package shadows admin.py (file). Load the file directly by path.
    _file = Path(__file__).parent.parent / "admin.py"
    _spec = spec_from_file_location("app.api.routers.admin_py", _file)
    _mod = module_from_spec(_spec)
    # Cache under the file module name to avoid reloading
    sys.modules["app.api.routers.admin_py"] = _mod
    _spec.loader.exec_module(_mod)  # type: ignore
    return _mod.router
