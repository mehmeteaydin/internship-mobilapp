from __future__ import annotations

import json
import sys
from collections.abc import AsyncGenerator
from datetime import datetime
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.modules.rag_assistant.deps import get_current_admin_identity, get_rag_db  # noqa: E402
from app.modules.rag_assistant.models import RagBase, RagReindexJob, RagSource  # noqa: E402
from app.modules.rag_assistant.reindex_worker import RagReindexWorker  # noqa: E402
from app.modules.rag_assistant.router import router as rag_router  # noqa: E402
from app.modules.rag_assistant.chunking import compute_sha256  # noqa: E402


@pytest_asyncio.fixture
async def rag_db_env(tmp_path: Path):
    db_file = tmp_path / "rag_test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_file}", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(RagBase.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    app = FastAPI()
    app.include_router(rag_router)

    async def _override_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    async def _override_admin() -> str:
        return "komisyon.admin@univ.edu.tr"

    app.dependency_overrides[get_rag_db] = _override_db
    app.dependency_overrides[get_current_admin_identity] = _override_admin

    try:
        yield app, session_factory
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def client(rag_db_env):
    app, _ = rag_db_env
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


async def seed_official_sources_and_index(session_factory: async_sessionmaker[AsyncSession]) -> None:
    manifest_path = REPO_ROOT / "assets" / "rag_sources" / "sources_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    async with session_factory() as session:
        for entry in manifest:
            raw_text = (REPO_ROOT / entry["file_path"]).read_text(encoding="utf-8")
            session.add(
                RagSource(
                    id=entry["source_id"],
                    source_title=entry["source_title"],
                    source_url=entry["source_url"],
                    source_type=entry["source_type"],
                    priority=entry["priority"],
                    published_at=datetime.fromisoformat(entry["published_at"].replace("Z", "+00:00")),
                    source_version=entry["source_version"],
                    content_hash=compute_sha256(raw_text),
                    raw_content=raw_text,
                    status="ACTIVE",
                    uploaded_by="komisyon.admin@univ.edu.tr",
                )
            )
        session.add(
            RagReindexJob(
                id="seed-job-1",
                status="QUEUED",
                requested_by="komisyon.admin@univ.edu.tr",
                source_scope_json={"scope": "ALL_ACTIVE"},
                total_items=len(manifest),
            )
        )
        await session.commit()

    worker = RagReindexWorker(session_factory=session_factory, worker_id="test-worker")
    did_work = await worker.run_once()
    assert did_work is True
