from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.rag_assistant.conftest import REPO_ROOT, seed_official_sources_and_index

GOLDEN_SET_PATH = REPO_ROOT / "assets" / "mock_data" / "rag_golden_set.json"
GOLDEN_CASES = json.loads(GOLDEN_SET_PATH.read_text(encoding="utf-8"))


@pytest.mark.asyncio
async def test_golden_set_count_meets_minimum_threshold() -> None:
    assert 25 <= len(GOLDEN_CASES) <= 40


@pytest.mark.asyncio
async def test_golden_set_end_to_end(rag_db_env, client) -> None:
    _, session_factory = rag_db_env
    await seed_official_sources_and_index(session_factory)

    for case in GOLDEN_CASES:
        resp = await client.post("/api/v1/assistant/ask", json={"question": case["question"]})
        assert resp.status_code == 200, f"{case['id']} returned {resp.status_code}"
        body = resp.json()
        expected = case["expected_behavior"]

        if expected == "PII_MASKED_ANSWER":
            assert body["status"] == "ANSWERED", f"{case['id']} expected ANSWERED, got {body}"
            assert body["pii_masked"] is True, f"{case['id']} should set pii_masked=True"
            for raw_pii in case.get("forbidden_raw_pii", []):
                assert raw_pii not in body["answer"], f"{case['id']} leaked raw PII {raw_pii}"
        else:
            assert body["status"] == expected, f"{case['id']} expected {expected}, got {body}"

        if expected in ("ANSWERED", "PII_MASKED_ANSWER"):
            citations = body["citations"]
            assert citations, f"{case['id']} missing citations"
            titles = {c["source_title"] for c in citations}
            articles = {c["article_no"] for c in citations}
            urls = {c["source_url"] for c in citations}
            assert case["expected_source_title"] in titles, f"{case['id']} missing source title in {titles}"
            assert case["expected_article_no"] in articles, f"{case['id']} missing article in {articles}"
            assert case["expected_source_url"] in urls, f"{case['id']} missing url in {urls}"

        if expected == "CONFLICT_DETECTED":
            assert body["conflict_detected"] is True
            titles = {c["source_title"] for c in body["citations"]}
            assert case["expected_source_title"] in titles, f"{case['id']} missing primary source"
            assert case["expected_secondary_source_title"] in titles, (
                f"{case['id']} missing secondary conflicting source"
            )

        if expected == "ELIGIBILITY_REDIRECT":
            assert body["redirect_target"] == "TRANSCRIPT_ANALYSIS"

        answer_lower = body["answer"].lower()
        for kw in case.get("must_include_keywords", []):
            assert kw.lower() in answer_lower, f"{case['id']} answer missing '{kw}': {body['answer']}"
