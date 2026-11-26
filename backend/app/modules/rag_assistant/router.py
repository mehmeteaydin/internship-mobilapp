from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.rag_assistant.deps import get_current_admin_identity, get_rag_db
from app.modules.rag_assistant.schemas import (
    AssistantAskRequest,
    AssistantAskResponse,
    RagReindexJobResponse,
    RagReindexRequest,
    RagSourceCreate,
    RagSourceDetailResponse,
    RagSourceResponse,
)
from app.modules.rag_assistant.service import RagService

admin_router = APIRouter(prefix="/api/v1/admin/rag", tags=["admin-rag"])
assistant_router = APIRouter(prefix="/api/v1/assistant", tags=["assistant"])

router = APIRouter()


@admin_router.get("/sources", response_model=list[RagSourceResponse])
async def list_rag_sources(
    include_archived: bool = False,
    db: AsyncSession = Depends(get_rag_db),
    _: str = Depends(get_current_admin_identity),
) -> list[RagSourceResponse]:
    service = RagService(db)
    sources = await service.list_sources(include_archived=include_archived)
    return [RagSourceResponse.model_validate(s) for s in sources]


@admin_router.post("/sources", response_model=RagSourceDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_rag_source(
    payload: RagSourceCreate,
    db: AsyncSession = Depends(get_rag_db),
    admin_id: str = Depends(get_current_admin_identity),
) -> RagSourceDetailResponse:
    service = RagService(db)
    created = await service.create_source(payload, admin_id=admin_id)
    return RagSourceDetailResponse.model_validate(created)


@admin_router.get("/sources/{source_id}", response_model=RagSourceDetailResponse)
async def get_rag_source(
    source_id: str,
    db: AsyncSession = Depends(get_rag_db),
    _: str = Depends(get_current_admin_identity),
) -> RagSourceDetailResponse:
    service = RagService(db)
    source = await service.get_source_or_404(source_id)
    return RagSourceDetailResponse.model_validate(source)


@admin_router.delete("/sources/{source_id}", response_model=RagSourceResponse)
async def archive_rag_source(
    source_id: str,
    db: AsyncSession = Depends(get_rag_db),
    admin_id: str = Depends(get_current_admin_identity),
) -> RagSourceResponse:
    service = RagService(db)
    archived = await service.archive_source(source_id, admin_id=admin_id)
    return RagSourceResponse.model_validate(archived)


@admin_router.post(
    "/reindex",
    response_model=RagReindexJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def enqueue_rag_reindex(
    payload: RagReindexRequest | None = None,
    db: AsyncSession = Depends(get_rag_db),
    admin_id: str = Depends(get_current_admin_identity),
) -> RagReindexJobResponse:
    service = RagService(db)
    job = await service.enqueue_reindex(payload or RagReindexRequest(), admin_id=admin_id)
    return RagReindexJobResponse.model_validate(job)


@admin_router.get("/reindex", response_model=list[RagReindexJobResponse])
async def list_rag_reindex_jobs(
    db: AsyncSession = Depends(get_rag_db),
    _: str = Depends(get_current_admin_identity),
) -> list[RagReindexJobResponse]:
    service = RagService(db)
    jobs = await service.list_jobs()
    return [RagReindexJobResponse.model_validate(j) for j in jobs]


@admin_router.get("/reindex/{job_id}", response_model=RagReindexJobResponse)
async def get_rag_reindex_job(
    job_id: str,
    db: AsyncSession = Depends(get_rag_db),
    _: str = Depends(get_current_admin_identity),
) -> RagReindexJobResponse:
    service = RagService(db)
    job = await service.get_job_or_404(job_id)
    return RagReindexJobResponse.model_validate(job)


@assistant_router.post("/ask", response_model=AssistantAskResponse)
async def ask_rag_assistant(
    payload: AssistantAskRequest,
    db: AsyncSession = Depends(get_rag_db),
) -> AssistantAskResponse:
    service = RagService(db)
    return await service.ask_assistant(payload.question)


router.include_router(admin_router)
router.include_router(assistant_router)
