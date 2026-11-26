from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

# Shared dependencies owned by Tuncay (`backend/app/core/database.py` & `admin_auth`).
# In isolated RAG tests or pre-merge branch checks, FastAPI dependency_overrides can inject
# test DB sessions / admin users without duplicating an auth implementation.
try:
    from app.core.database import get_db as _core_get_db  # type: ignore[import-not-found]
except ImportError:
    _core_get_db = None

try:
    from app.modules.admin_auth.dependencies import get_current_admin as _core_get_current_admin  # type: ignore[import-not-found]
except ImportError:
    _core_get_current_admin = None

try:
    from app.modules.admin_auth.audit import write_audit_log as _core_write_audit_log  # type: ignore[import-not-found]
except ImportError:
    _core_write_audit_log = None


async def get_rag_db() -> AsyncGenerator[AsyncSession, None]:
    if _core_get_db is None:
        raise RuntimeError(
            "app.core.database.get_db is not mounted yet; override get_rag_db in test/standalone mode."
        )
    async for session in _core_get_db():
        yield session


async def require_rag_admin() -> Any:
    if _core_get_current_admin is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "ADMIN_AUTH_UNAVAILABLE",
                "message": "Ortak admin_auth bağımlılığı henüz bağlanmadı.",
            },
        )
    return _core_get_current_admin


async def get_current_admin_identity(
    admin: Any = Depends(_core_get_current_admin if _core_get_current_admin is not None else require_rag_admin),
) -> str:
    if isinstance(admin, str):
        return admin
    if isinstance(admin, dict):
        return str(admin.get("email") or admin.get("id") or "admin")
    return str(getattr(admin, "email", None) or getattr(admin, "id", "admin"))


async def record_rag_audit_log(
    db: AsyncSession,
    *,
    admin_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    payload_summary: dict[str, Any],
) -> None:
    if _core_write_audit_log is not None:
        await _core_write_audit_log(
            db,
            admin_id=admin_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            payload_summary=payload_summary,
        )
