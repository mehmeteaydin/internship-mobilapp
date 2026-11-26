"""Create rag_sources, rag_documents (pgvector), and rag_reindex_jobs tables.

Revision ID: 20261127_01_rag
Revises:
Create Date: 2026-11-27 01:10:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261127_01_rag"
down_revision = None
branch_labels = ("rag_assistant",)
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    if is_pg:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "rag_sources",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("source_title", sa.String(length=255), nullable=False),
        sa.Column("source_url", sa.String(length=512), nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_version", sa.String(length=64), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("raw_content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ACTIVE"),
        sa.Column("uploaded_by", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "rag_documents",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column(
            "source_id",
            sa.String(length=64),
            sa.ForeignKey("rag_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_id", sa.String(length=128), nullable=False),
        sa.Column("source_title", sa.String(length=255), nullable=False),
        sa.Column("source_url", sa.String(length=512), nullable=False),
        sa.Column("article_no", sa.String(length=64), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_version", sa.String(length=64), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    if is_pg:
        op.execute("ALTER TABLE rag_documents ALTER COLUMN embedding TYPE vector(384) USING NULL")
        op.execute(
            "CREATE INDEX ix_rag_documents_embedding_hnsw ON rag_documents "
            "USING hnsw (embedding vector_cosine_ops) WHERE is_active = TRUE"
        )
    op.create_index("ix_rag_documents_active_priority", "rag_documents", ["is_active", "priority"])
    op.create_index("ix_rag_documents_source_chunk", "rag_documents", ["source_id", "chunk_id"])

    json_type = postgresql.JSONB(astext_type=sa.Text()) if is_pg else sa.JSON()
    op.create_table(
        "rag_reindex_jobs",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="QUEUED"),
        sa.Column("requested_by", sa.String(length=128), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_scope_json", json_type, nullable=False),
        sa.Column("total_items", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed_items", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("worker_id", sa.String(length=128), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_summary", sa.String(length=512), nullable=True),
        sa.Column("result_summary", json_type, nullable=True),
    )
    op.create_index("ix_rag_reindex_jobs_queue", "rag_reindex_jobs", ["status", "requested_at"])
    op.create_index("ix_rag_reindex_jobs_lease", "rag_reindex_jobs", ["status", "lease_expires_at"])


def downgrade() -> None:
    op.drop_index("ix_rag_reindex_jobs_lease", table_name="rag_reindex_jobs")
    op.drop_index("ix_rag_reindex_jobs_queue", table_name="rag_reindex_jobs")
    op.drop_table("rag_reindex_jobs")

    op.drop_index("ix_rag_documents_source_chunk", table_name="rag_documents")
    op.drop_index("ix_rag_documents_active_priority", table_name="rag_documents")
    op.drop_table("rag_documents")
    op.drop_table("rag_sources")
