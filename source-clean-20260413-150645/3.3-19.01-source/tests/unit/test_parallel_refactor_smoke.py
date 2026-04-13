from __future__ import annotations

from importlib import import_module


def test_lessons_package_exports_are_lazy_and_resolvable():
    lessons_pkg = import_module("app.services.lessons")
    checkpoint_fn = lessons_pkg.read_json_file
    generation_cls = lessons_pkg.LessonGenerationService

    checkpoint_module = import_module("app.services.lessons.checkpoint")
    generation_module = import_module("app.services.lessons.generation")

    assert checkpoint_fn is checkpoint_module.read_json_file
    assert generation_cls is generation_module.LessonGenerationService


def test_generation_legacy_alias_resolves_to_lesson_service():
    generation_module = import_module("app.services.lessons.generation")
    lesson_service_module = import_module("app.services.lesson_service")

    assert generation_module.LegacyLessonService is lesson_service_module.LessonService


def test_router_packages_reexport_canonical_router_modules():
    admin_router = import_module("app.api.routers.admin").router
    auth_router = import_module("app.api.routers.auth").router
    billing_router = import_module("app.api.routers.billing").router
    llm_router = import_module("app.api.routers.llm").router

    assert any(route.path == "/api/admin/users" for route in admin_router.routes)
    assert any(route.path == "/api/auth/login" for route in auth_router.routes)
    assert any(route.path == "/api/billing/rates" for route in billing_router.routes)
    assert any(route.path == "/api/llm/models" for route in llm_router.routes)


def test_create_app_smoke_after_parallel_refactor():
    app_main = import_module("app.main")
    app = app_main.create_app(enable_lifespan=False)

    paths = {route.path for route in app.routes}

    assert "/health" in paths
    assert "/api/auth/login" in paths
    assert "/api/admin/users" in paths
    assert "/api/llm/models" in paths
