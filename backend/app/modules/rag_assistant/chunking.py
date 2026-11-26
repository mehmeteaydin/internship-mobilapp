from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

SECTION_HEADING_RE = re.compile(
    r"^##\s+(?P<article>(?:Madde\s+\d+|Karar\s+\d{4}/\d+|SSS-\d+))\s*(?:[—\-:]\s*(?P<title>.+))?$",
    re.MULTILINE,
)


@dataclass(frozen=True)
class DocumentChunk:
    chunk_id: str
    article_no: str
    content: str
    content_hash: str


def compute_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def chunk_source_markdown(source_id: str, raw_content: str, max_chars: int = 1200) -> list[DocumentChunk]:
    """Splits official markdown into article-aligned chunks preserving article numbers."""
    text = raw_content.strip()
    matches = list(SECTION_HEADING_RE.finditer(text))
    if not matches:
        normalized = text
        return [
            DocumentChunk(
                chunk_id=f"{source_id}:genel-01",
                article_no="Genel",
                content=normalized,
                content_hash=compute_sha256(normalized),
            )
        ]

    chunks: list[DocumentChunk] = []
    for idx, match in enumerate(matches):
        article_no = match.group("article").strip()
        heading_title = (match.group("title") or "").strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        combined = f"{article_no} — {heading_title}\n{body}".strip() if heading_title else f"{article_no}\n{body}".strip()

        if len(combined) <= max_chars:
            slug = re.sub(r"[^a-zA-Z0-9]+", "-", article_no.lower()).strip("-")
            chunks.append(
                DocumentChunk(
                    chunk_id=f"{source_id}:{slug}",
                    article_no=article_no,
                    content=combined,
                    content_hash=compute_sha256(combined),
                )
            )
        else:
            paragraphs = [p.strip() for p in combined.split("\n\n") if p.strip()]
            part_no = 1
            buffer = ""
            for para in paragraphs:
                candidate = f"{buffer}\n\n{para}".strip() if buffer else para
                if len(candidate) > max_chars and buffer:
                    slug = re.sub(r"[^a-zA-Z0-9]+", "-", article_no.lower()).strip("-")
                    chunks.append(
                        DocumentChunk(
                            chunk_id=f"{source_id}:{slug}-p{part_no}",
                            article_no=article_no,
                            content=buffer,
                            content_hash=compute_sha256(buffer),
                        )
                    )
                    part_no += 1
                    buffer = f"{article_no} ({heading_title})\n{para}".strip()
                else:
                    buffer = candidate
            if buffer:
                slug = re.sub(r"[^a-zA-Z0-9]+", "-", article_no.lower()).strip("-")
                chunks.append(
                    DocumentChunk(
                        chunk_id=f"{source_id}:{slug}-p{part_no}",
                        article_no=article_no,
                        content=buffer,
                        content_hash=compute_sha256(buffer),
                    )
                )

    return chunks
