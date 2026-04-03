# app/api/routers/admin/ intentionally has no router re-export.
# The sub-package router.py is a legacy parallel copy and should not be imported here.
# Code that needs the admin router should import via:
#   from app.api.routers import admin          # gives the APIRouter directly
# NOT:
#   from app.api.routers.admin import router   # goes to sub-package, not top-level admin.py
