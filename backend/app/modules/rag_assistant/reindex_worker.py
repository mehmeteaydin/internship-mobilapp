from __future__ import annotations

import asyncio
import logging
import os
import socket
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.modules.rag_assistant.chunking import chunk_source_markdown
from app.modules.rag_assistant.embeddings import EmbeddingProvider, build_default_embedder
from app.modules.rag_assistant.guardrails import sanitize_error_summary
from app.modules.rag_assistant.models import RagDocument, RagReindexJob
from app.modules.rag_assistant.repository import RagRepository

logger = logging.getLogger("rag_assistant.worker")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class RagReindexWorker:
    """Persistent DB-backed reindex worker using FOR UPDATE SKIP LOCKED + lease/heartbeat."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        embedder: EmbeddingProvider | None = None,
        *,
        worker_id: str | None = None,
        lease_seconds: int = 60,
        max_attempts: int = 3,
    ) -> None:
        self.session_factory = session_factory
        self.embedder = embedder or build_default_embedder()
        self.worker_id = worker_id or f"rag-worker-{socket.gethostname()}-{uuid.uuid4().hex[:6]}"
        self.lease_seconds = lease_seconds
        self.max_attempts = max_attempts

    async def recover_expired_leases(self, now: datetime | None = None) -> dict[str, int]:
        """Requeues or fails RUNNING jobs whose lease expired (e.g. after container crash/restart)."""
        current = now or _utcnow()
        requeued = 0
        failed = 0

        async with self.session_factory() as session:
            stmt = select(RagReindexJob).where(
                RagReindexJob.status == "RUNNING",
                RagReindexJob.lease_expires_at.is_not(None),
                RagReindexJob.lease_expires_at < current,
            )
            result = await session.execute(stmt)
            expired_jobs = list(result.scalars().all())

            for job in expired_jobs:
                if job.attempt_count < self.max_attempts:
                    job.status = "QUEUED"
                    job.worker_id = None
                    job.lease_expires_at = None
                    job.error_code = "LEASE_EXPIRED_RETRY"
                    job.error_summary = "Worker lease süresi doldu; iş yeniden kuyruğa alındı."
                    requeued += 1
                else:
                    job.status = "FAILED"
                    job.completed_at = current
                    job.lease_expires_at = None
                    job.error_code = "MAX_RETRIES_EXCEEDED"
                    job.error_summary = (
                        f"Maksimum deneme sınırına ({self.max_attempts}) ulaşıldı; iş başarısız işaretlendi."
                    )
                    failed += 1

            await session.commit()

        return {"requeued": requeued, "failed": failed}

    async def claim_next_job(self, now: datetime | None = None) -> RagReindexJob | None:
        """Atomically claims one QUEUED job using FOR UPDATE SKIP LOCKED."""
        current = now or _utcnow()
        lease_until = current + timedelta(seconds=self.lease_seconds)

        async with self.session_factory() as session:
            stmt = (
                select(RagReindexJob)
                .where(RagReindexJob.status == "QUEUED")
                .order_by(RagReindexJob.requested_at.asc())
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            result = await session.execute(stmt)
            job = result.scalar_one_or_none()
            if job is None:
                return None

            job.status = "RUNNING"
            job.worker_id = self.worker_id
            job.attempt_count = (job.attempt_count or 0) + 1
            job.started_at = job.started_at or current
            job.heartbeat_at = current
            job.lease_expires_at = lease_until
            job.error_code = None
            job.error_summary = None

            await session.commit()
            await session.refresh(job)
            return job

    async def process_job(self, job_id: str) -> RagReindexJob:
        async with self.session_factory() as session:
            repo = RagRepository(session)
            job = await repo.get_job(job_id)
            if job is None:
                raise ValueError(f"Job {job_id} not found")

            try:
                sources = await repo.list_active_sources_for_scope(job.source_scope_json)
                job.total_items = len(sources)
                job.processed_items = 0
                total_chunks = 0

                for idx, source in enumerate(sources, start=1):
                    chunks = chunk_source_markdown(source.id, source.raw_content)
                    embeddings = await self.embedder.embed_texts([c.content for c in chunks])
                    docs = [
                        RagDocument(
                            source_id=source.id,
                            chunk_id=chunk.chunk_id,
                            source_title=source.source_title,
                            source_url=source.source_url,
                            article_no=chunk.article_no,
                            priority=source.priority,
                            published_at=source.published_at,
                            source_version=source.source_version,
                            content_hash=chunk.content_hash,
                            content=chunk.content,
                            embedding=embedding,
                            is_active=True,
                        )
                        for chunk, embedding in zip(chunks, embeddings)
                    ]
                    await repo.replace_source_documents(source.id, docs)
                    total_chunks += len(docs)

                    now = _utcnow()
                    job.processed_items = idx
                    job.heartbeat_at = now
                    job.lease_expires_at = now + timedelta(seconds=self.lease_seconds)
                    await session.flush()

                completed_at = _utcnow()
                job.status = "SUCCEEDED"
                job.completed_at = completed_at
                job.heartbeat_at = completed_at
                job.result_summary = {
                    "indexed_sources": len(sources),
                    "indexed_chunks": total_chunks,
                }
                await session.commit()
                await session.refresh(job)
                return job
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                now = _utcnow()
                safe_msg = sanitize_error_summary(exc)
                async with self.session_factory() as err_session:
                    err_repo = RagRepository(err_session)
                    err_job = await err_repo.get_job(job_id)
                    if err_job is not None:
                        if err_job.attempt_count < self.max_attempts:
                            err_job.status = "QUEUED"
                            err_job.worker_id = None
                            err_job.lease_expires_at = None
                            err_job.error_code = "TRANSIENT_RETRY"
                        else:
                            err_job.status = "FAILED"
                            err_job.completed_at = now
                            err_job.lease_expires_at = None
                            err_job.error_code = "REINDEX_FAILED"
                        err_job.error_summary = safe_msg
                        await err_session.commit()
                        await err_session.refresh(err_job)
                        return err_job
                raise

    async def run_once(self) -> bool:
        await self.recover_expired_leases()
        job = await self.claim_next_job()
        if job is None:
            return False
        await self.process_job(job.id)
        return True

    async def run_forever(self, poll_interval_seconds: float = 2.0) -> None:
        logger.info("Starting rag-worker loop worker_id=%s", self.worker_id)
        while True:
            did_work = await self.run_once()
            if not did_work:
                await asyncio.sleep(poll_interval_seconds)


async def _main() -> None:
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@postgres:5432/staj_yardimcisi",
    )
    engine = create_async_engine(database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    worker = RagReindexWorker(session_factory=session_factory)
    await worker.run_forever()


if __name__ == "__main__":
    asyncio.run(_main())
