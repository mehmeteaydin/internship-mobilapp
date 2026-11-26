from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator, UserDefinedType


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class _PgVectorType(UserDefinedType):
    cache_ok = True

    def __init__(self, dimensions: int = 384) -> None:
        self.dimensions = dimensions

    def get_col_spec(self, **kw: Any) -> str:
        return f"VECTOR({self.dimensions})"


class EmbeddingVector(TypeDecorator):
    """Uses pgvector VECTOR(N) on PostgreSQL and JSON array on SQLite/other dialects."""

    impl = JSON
    cache_ok = True

    def __init__(self, dimensions: int = 384) -> None:
        super().__init__()
        self.dimensions = dimensions

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(_PgVectorType(self.dimensions))
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value: list[float] | None, dialect: Any) -> Any:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return "[" + ",".join(f"{float(v):.8f}" for v in value) + "]"
        return [float(v) for v in value]

    def process_result_value(self, value: Any, dialect: Any) -> list[float] | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("[") and stripped.endswith("]"):
                return [float(x) for x in json.loads(stripped)]
        return [float(v) for v in value]


JsonDictType = JSON().with_variant(JSONB(), "postgresql")


class RagBase(DeclarativeBase):
    """Declarative base for rag_assistant tables (aligned with shared Alembic metadata)."""


class RagSource(RagBase):
    __tablename__ = "rag_sources"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str] = mapped_column(String(512), nullable=False)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False, default="DIRECTIVE")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    source_version: Mapped[str] = mapped_column(String(64), nullable=False, default="1.0")
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    raw_content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ACTIVE")
    uploaded_by: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    documents: Mapped[list["RagDocument"]] = relationship(
        "RagDocument", back_populates="source", cascade="all, delete-orphan"
    )


class RagDocument(RagBase):
    __tablename__ = "rag_documents"
    __table_args__ = (
        Index("ix_rag_documents_active_priority", "is_active", "priority"),
        Index("ix_rag_documents_source_chunk", "source_id", "chunk_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("rag_sources.id", ondelete="CASCADE"), nullable=False
    )
    chunk_id: Mapped[str] = mapped_column(String(128), nullable=False)
    source_title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str] = mapped_column(String(512), nullable=False)
    article_no: Mapped[str] = mapped_column(String(64), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_version: Mapped[str] = mapped_column(String(64), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(EmbeddingVector(384), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    source: Mapped[RagSource] = relationship("RagSource", back_populates="documents")


class RagReindexJob(RagBase):
    __tablename__ = "rag_reindex_jobs"
    __table_args__ = (
        Index("ix_rag_reindex_jobs_queue", "status", "requested_at"),
        Index("ix_rag_reindex_jobs_lease", "status", "lease_expires_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="QUEUED")
    requested_by: Mapped[str] = mapped_column(String(128), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_scope_json: Mapped[dict[str, Any]] = mapped_column(JsonDictType, nullable=False, default=dict)
    total_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    worker_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_summary: Mapped[str | None] = mapped_column(String(512), nullable=True)
    result_summary: Mapped[dict[str, Any] | None] = mapped_column(JsonDictType, nullable=True)
