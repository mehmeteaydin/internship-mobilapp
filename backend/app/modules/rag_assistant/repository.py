from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.rag_assistant.models import RagDocument, RagReindexJob, RagSource


class RagRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_sources(self, include_archived: bool = False) -> list[RagSource]:
        stmt = select(RagSource).order_by(RagSource.priority.asc(), RagSource.created_at.desc())
        if not include_archived:
            stmt = stmt.where(RagSource.archived_at.is_(None))
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_source(self, source_id: str) -> RagSource | None:
        result = await self.session.execute(select(RagSource).where(RagSource.id == source_id))
        return result.scalar_one_or_none()

    async def create_source(self, source: RagSource) -> RagSource:
        self.session.add(source)
        await self.session.flush()
        return source

    async def soft_archive_source(self, source: RagSource) -> RagSource:
        now = datetime.now(timezone.utc)
        source.status = "ARCHIVED"
        source.archived_at = now
        source.updated_at = now
        await self.session.execute(
            update(RagDocument)
            .where(RagDocument.source_id == source.id)
            .values(is_active=False, updated_at=now)
        )
        await self.session.flush()
        return source

    async def list_active_jobs(self) -> list[RagReindexJob]:
        stmt = select(RagReindexJob).where(RagReindexJob.status.in_(["QUEUED", "RUNNING"]))
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_jobs(self, limit: int = 25) -> list[RagReindexJob]:
        stmt = select(RagReindexJob).order_by(RagReindexJob.requested_at.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_job(self, job_id: str) -> RagReindexJob | None:
        result = await self.session.execute(select(RagReindexJob).where(RagReindexJob.id == job_id))
        return result.scalar_one_or_none()

    async def create_job(self, job: RagReindexJob) -> RagReindexJob:
        self.session.add(job)
        await self.session.flush()
        return job

    async def list_active_documents(self) -> list[RagDocument]:
        stmt = (
            select(RagDocument)
            .join(RagSource, RagDocument.source_id == RagSource.id)
            .where(RagDocument.is_active.is_(True), RagSource.archived_at.is_(None))
            .order_by(RagDocument.priority.asc(), RagDocument.id.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_active_sources_for_scope(self, source_scope_json: dict[str, Any]) -> list[RagSource]:
        stmt = select(RagSource).where(RagSource.archived_at.is_(None), RagSource.status == "ACTIVE")
        source_ids = source_scope_json.get("source_ids")
        if source_ids:
            stmt = stmt.where(RagSource.id.in_(source_ids))
        stmt = stmt.order_by(RagSource.priority.asc(), RagSource.created_at.asc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def replace_source_documents(
        self, source_id: str, new_documents: list[RagDocument]
    ) -> None:
        now = datetime.now(timezone.utc)
        await self.session.execute(
            update(RagDocument)
            .where(RagDocument.source_id == source_id, RagDocument.is_active.is_(True))
            .values(is_active=False, updated_at=now)
        )
        for doc in new_documents:
            self.session.add(doc)
        await self.session.flush()
