from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from docx import Document
from sqlalchemy import select

from app.modules.rag_assistant.guardrails import sanitize_error_summary
from app.modules.rag_assistant.models import RagDocument, RagReindexJob
from app.modules.rag_assistant.reindex_worker import RagReindexWorker
from tests.rag_assistant.conftest import REPO_ROOT


@pytest.mark.asyncio
async def test_source_crud_enqueue_duplicate_guard_and_soft_archive(rag_db_env, client) -> None:
    _, session_factory = rag_db_env

    create_payload = {
        "source_title": "Test Staj Duyurusu",
        "source_url": "https://bilgisayar.univ.edu.tr/duyuru-test",
        "source_type": "COMMITTEE_RULE",
        "priority": 2,
        "published_at": "2026-11-25T10:00:00Z",
        "source_version": "2026.9",
        "raw_content": "## Karar 2026/99 — Deneme Kuralı\nStaj başvurularında ıslak imza yerine karekodlu belge geçerlidir.",
    }
    create_resp = await client.post("/api/v1/admin/rag/sources", json=create_payload)
    assert create_resp.status_code == 201
    source_id = create_resp.json()["id"]

    # Enqueue returns 202 Accepted + persistent job_id
    job_resp = await client.post("/api/v1/admin/rag/reindex", json={})
    assert job_resp.status_code == 202
    job_id = job_resp.json()["id"]
    assert job_resp.json()["status"] == "QUEUED"

    # Duplicate active scope enqueue is rejected with 409
    dup_resp = await client.post("/api/v1/admin/rag/reindex", json={"source_ids": [source_id]})
    assert dup_resp.status_code == 409
    assert dup_resp.json()["detail"]["code"] == "RAG_REINDEX_ALREADY_ACTIVE"

    # Run worker to index source
    worker = RagReindexWorker(session_factory=session_factory, worker_id="worker-api-test")
    assert await worker.run_once() is True

    status_resp = await client.get(f"/api/v1/admin/rag/reindex/{job_id}")
    assert status_resp.status_code == 200
    job_data = status_resp.json()
    assert job_data["status"] == "SUCCEEDED"
    assert job_data["worker_id"] == "worker-api-test"
    assert job_data["processed_items"] == 1
    assert job_data["result_summary"]["indexed_chunks"] == 1

    # Soft archive marks source archived and deactivates its chunks
    del_resp = await client.delete(f"/api/v1/admin/rag/sources/{source_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "ARCHIVED"
    assert del_resp.json()["archived_at"] is not None

    async with session_factory() as session:
        docs = (await session.execute(select(RagDocument).where(RagDocument.source_id == source_id))).scalars().all()
        assert len(docs) == 1
        assert docs[0].is_active is False


@pytest.mark.asyncio
async def test_worker_lease_expiration_recovery_and_max_retries(rag_db_env) -> None:
    _, session_factory = rag_db_env
    now = datetime.now(timezone.utc)

    async with session_factory() as session:
        # Job 1: expired lease with attempt_count < 3 -> should requeue
        session.add(
            RagReindexJob(
                id="job-expired-retry",
                status="RUNNING",
                requested_by="admin@univ.edu.tr",
                requested_at=now - timedelta(minutes=10),
                started_at=now - timedelta(minutes=9),
                source_scope_json={"scope": "ALL_ACTIVE"},
                attempt_count=1,
                worker_id="crashed-worker",
                heartbeat_at=now - timedelta(minutes=5),
                lease_expires_at=now - timedelta(seconds=30),
            )
        )
        # Job 2: expired lease at attempt_count == 3 -> should fail permanently
        session.add(
            RagReindexJob(
                id="job-expired-fail",
                status="RUNNING",
                requested_by="admin@univ.edu.tr",
                requested_at=now - timedelta(minutes=20),
                started_at=now - timedelta(minutes=19),
                source_scope_json={"scope": "ALL_ACTIVE"},
                attempt_count=3,
                worker_id="crashed-worker",
                heartbeat_at=now - timedelta(minutes=5),
                lease_expires_at=now - timedelta(seconds=10),
            )
        )
        await session.commit()

    worker = RagReindexWorker(session_factory=session_factory, worker_id="recovery-worker", max_attempts=3)
    recovery = await worker.recover_expired_leases(now=now)
    assert recovery == {"requeued": 1, "failed": 1}

    async with session_factory() as session:
        j1 = await session.get(RagReindexJob, "job-expired-retry")
        j2 = await session.get(RagReindexJob, "job-expired-fail")
        assert j1 is not None and j1.status == "QUEUED" and j1.error_code == "LEASE_EXPIRED_RETRY"
        assert j2 is not None and j2.status == "FAILED" and j2.error_code == "MAX_RETRIES_EXCEEDED"


def test_error_summary_redacts_keys_and_pii() -> None:
    raw = "Auth failed with Bearer eyJhbGciOiJIUzI1NiJ9.abc and sk-proj-secret123456 for 12345678901"
    cleaned = sanitize_error_summary(raw)
    assert "eyJhbGciOiJIUzI1NiJ9" not in cleaned
    assert "sk-proj-secret123456" not in cleaned
    assert "12345678901" not in cleaned


def test_docx_template_contains_required_placeholders_in_all_sections() -> None:
    tpl_path = REPO_ROOT / "assets" / "templates" / "staj_basvuru_formu_v3_1.docx"
    schema_path = REPO_ROOT / "assets" / "templates" / "template_placeholders_schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    doc = Document(tpl_path)

    chunks = [p.text for p in doc.paragraphs]
    chunks.extend(c.text for t in doc.tables for r in t.rows for c in r.cells)
    for sec in doc.sections:
        chunks.extend(p.text for p in sec.header.paragraphs)
        chunks.extend(p.text for p in sec.footer.paragraphs)

    found = set(re.findall(r"\{\{(\w+)\}\}", "\n".join(chunks)))
    missing = set(schema["required_placeholders"]) - found
    assert not missing
