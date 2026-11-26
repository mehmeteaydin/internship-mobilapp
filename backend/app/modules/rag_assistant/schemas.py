from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


SourceType = Literal["DIRECTIVE", "COMMITTEE_RULE", "FAQ"]
JobStatus = Literal["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]
AssistantStatus = Literal[
    "ANSWERED",
    "CONFLICT_DETECTED",
    "OUT_OF_SCOPE",
    "ELIGIBILITY_REDIRECT",
    "PROMPT_INJECTION_BLOCKED",
]


class ErrorEnvelope(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    request_id: str


class RagSourceCreate(BaseModel):
    source_title: str = Field(..., min_length=3, max_length=255)
    source_url: str = Field(..., min_length=8, max_length=512)
    source_type: SourceType
    priority: int = Field(..., ge=1, le=3)
    published_at: datetime
    source_version: str = Field(..., min_length=1, max_length=64)
    raw_content: str = Field(..., min_length=10)

    @field_validator("source_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        if not (value.startswith("https://") or value.startswith("http://")):
            raise ValueError("source_url must start with http:// or https://")
        return value


class RagSourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_title: str
    source_url: str
    source_type: str
    priority: int
    published_at: datetime
    source_version: str
    content_hash: str
    status: str
    uploaded_by: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None


class RagSourceDetailResponse(RagSourceResponse):
    raw_content: str


class RagReindexRequest(BaseModel):
    source_ids: list[str] | None = Field(
        default=None,
        description="Belirli kaynak ID listesi; boş bırakılırsa tüm aktif kaynaklar yeniden indekslenir.",
    )


class RagReindexJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: JobStatus
    requested_by: str
    requested_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    source_scope_json: dict[str, Any]
    total_items: int
    processed_items: int
    attempt_count: int
    worker_id: str | None = None
    heartbeat_at: datetime | None = None
    lease_expires_at: datetime | None = None
    error_code: str | None = None
    error_summary: str | None = None
    result_summary: dict[str, Any] | None = None


class AssistantAskRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=1500)


class CitationItem(BaseModel):
    source_id: str
    source_title: str
    article_no: str
    source_url: str
    priority: int
    source_version: str


class AssistantAskResponse(BaseModel):
    status: AssistantStatus
    answer: str
    citations: list[CitationItem] = Field(default_factory=list)
    conflict_detected: bool = False
    redirect_target: str | None = None
    pii_masked: bool = False
