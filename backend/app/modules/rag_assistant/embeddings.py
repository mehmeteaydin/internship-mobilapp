from __future__ import annotations

import hashlib
import math
import os
import re
from typing import Protocol

import httpx

EMBEDDING_DIMENSIONS = 384

_TR_MAP = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
_TOKEN_RE = re.compile(r"[a-z0-9]+")

_STOPWORDS = {
    "ve",
    "veya",
    "ile",
    "icin",
    "bu",
    "bir",
    "mi",
    "mu",
    "miyim",
    "muyum",
    "mı",
    "mü",
    "da",
    "de",
    "ki",
    "ne",
    "kadar",
    "nasil",
    "nelerdir",
    "hangi",
    "gore",
    "olarak",
    "uzere",
    "gibi",
    "daha",
    "sonra",
    "once",
    "icinde",
    "var",
    "yok",
    "olur",
    "midir",
    "mudur",
}


def normalize_turkish(text: str) -> str:
    cleaned = re.sub(r"\[MASKED_[A-Z_]+\]", " ", text)
    lowered = cleaned.translate(_TR_MAP).lower()
    return re.sub(r"['’`\".,;:!?()\[\]{}/\\—\-]+", " ", lowered)


def tokenize_turkish(text: str) -> list[str]:
    norm = normalize_turkish(text)
    tokens = [tok for tok in _TOKEN_RE.findall(norm) if tok not in _STOPWORDS and len(tok) >= 2]
    return tokens


class EmbeddingProvider(Protocol):
    async def embed_texts(self, texts: list[str]) -> list[list[float]]: ...


class DeterministicSemanticEmbedder:
    """Offline deterministic 384-dim Turkish stem + char-ngram embedder (Zero external calls)."""

    def __init__(self, dimensions: int = EMBEDDING_DIMENSIONS) -> None:
        self.dimensions = dimensions

    def embed_sync(self, text: str) -> list[float]:
        vec = [0.0] * self.dimensions
        tokens = tokenize_turkish(text)
        if not tokens:
            return vec

        features: list[tuple[str, float]] = []
        for tok in tokens:
            features.append((f"w:{tok}", 2.2))
            if len(tok) >= 4:
                features.append((f"s4:{tok[:4]}", 1.8))
            if len(tok) >= 5:
                features.append((f"s5:{tok[:5]}", 2.0))
            padded = f"^{tok}$"
            for i in range(len(padded) - 2):
                features.append((f"g3:{padded[i:i+3]}", 0.45))

        for i in range(len(tokens) - 1):
            features.append((f"bi:{tokens[i][:5]}_{tokens[i+1][:5]}", 2.0))

        for feat, weight in features:
            digest = hashlib.blake2b(feat.encode("utf-8"), digest_size=8).digest()
            idx = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if (digest[4] & 1) == 0 else -1.0
            vec[idx] += sign * weight

        norm = math.sqrt(sum(v * v for v in vec))
        if norm == 0.0:
            return vec
        return [v / norm for v in vec]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self.embed_sync(t) for t in texts]


class HttpZeroRetentionEmbedder:
    """Optional external embedding API client enforcing zero-data-retention headers."""

    def __init__(
        self,
        api_url: str,
        api_key: str,
        model: str = "text-embedding-3-small",
        dimensions: int = EMBEDDING_DIMENSIONS,
    ) -> None:
        self.api_url = api_url
        self.api_key = api_key
        self.model = model
        self.dimensions = dimensions

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-Data-Retention": "zero",
        }
        payload = {"input": texts, "model": self.model, "dimensions": self.dimensions}
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(self.api_url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return [item["embedding"][: self.dimensions] for item in data["data"]]


def build_default_embedder() -> EmbeddingProvider:
    api_url = os.getenv("RAG_EMBEDDING_API_URL", "").strip()
    api_key = os.getenv("RAG_EMBEDDING_API_KEY", "").strip()
    if api_url and api_key:
        return HttpZeroRetentionEmbedder(api_url=api_url, api_key=api_key)
    return DeterministicSemanticEmbedder()


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)
