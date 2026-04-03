# Re-export the top-level admin router so that:
#   from app.api.routers.admin import router
# resolves to the router object (APIRouter from admin.py) instead of the
# sub-package module (app.api.routers.admin.router).
from app.api.routers.admin.router import router

__all__ = ["router"]
