from __future__ import annotations

import re
from dataclasses import dataclass

from app.modules.rag_assistant.embeddings import normalize_turkish

OUT_OF_SCOPE_MESSAGE = (
    "Bu bilgi mevcut resmî staj yönergesi ve SSS kayıtlarında yer almıyor. "
    "Kesin bilgi için Bölüm Staj Komisyonuna danışmalısınız."
)

ELIGIBILITY_REDIRECT_MESSAGE = (
    "Bireysel transkript durumunuza ve İSG ders notlarınıza göre hangi dönemlerde staj yapabileceğiniz "
    "yalnızca deterministik kural motoru tarafından hesaplanır. Lütfen uygulamadaki "
    "Transkript Analiz ekranına giderek e-Devlet veya OBS transkriptinizi yükleyin."
)

PROMPT_INJECTION_REFUSAL_MESSAGE = (
    "Güvenlik politikası gereği sistem talimatlarını değiştirmeye veya yetkisiz karar üretmeye yönelik "
    "istekler işlenemez. Yalnızca resmî staj yönergesi ve Bölüm Staj Komisyonu esasları hakkında soru sorabilirsiniz."
)


@dataclass(frozen=True)
class PiiMaskResult:
    masked_text: str
    pii_masked: bool


@dataclass(frozen=True)
class ConflictResult:
    conflict_detected: bool
    conflict_summary: str | None = None
    conflicting_chunk_ids: tuple[str, ...] = ()


_TC_RE = re.compile(r"\b[1-9]\d{10}\b")
_TR_PHONE_RE = re.compile(r"(?:\+?90[\s\-]?)?(?:0?5\d{2})[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}\b")
_EMAIL_RE = re.compile(r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b")
_IBAN_RE = re.compile(r"\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b", re.IGNORECASE)
_STUDENT_NO_RE = re.compile(r"\b(?:19|20|21|22|23|24|25|26)\d{6,9}\b")
_NAME_INTRO_RE = re.compile(
    r"\b(?:[Bb]en|[Aa]dım|[İi]smim)\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+){1,2})"
)

_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(?:all\s+)?(?:previous|prior|system)\s+instructions?", re.IGNORECASE),
    re.compile(r"(?:reveal|show|print|leak)\s+(?:your\s+)?(?:system\s+prompt|api\s+keys?|secrets?)", re.IGNORECASE),
    re.compile(r"(?:önceki|tüm)\s+(?:yönerge\s+)?(?:kuralları|talimatları)\s*(?:ni)?\s*unut", re.IGNORECASE),
    re.compile(r"sistem\s+talimatını\s+(?:yaz|göster|söyle)", re.IGNORECASE),
    re.compile(r"<\s*/?\s*system\s*>|\[INST\]|\[/INST\]", re.IGNORECASE),
    re.compile(r"isg\s+geçmeyenlere\s+de\s+staj\s+yapabilirsin\s+de", re.IGNORECASE),
    re.compile(r"(?:rol\s+yap|jailbreak|dan\s+mode)", re.IGNORECASE),
]

_GRADE_TOKEN_RE = re.compile(
    r"\b(?:AA|BA|BB|CB|CC|DC|DD|FD|FF|DZ|GR|MU)\b",
)

_PERSONAL_ELIGIBILITY_SIGNALS = [
    re.compile(r"\btranskriptim(?:de|i|e)?\b"),
    re.compile(r"\b(?:1|2|3|4)\s*\.\s*sınıf(?:ım|ta|tan|\s+öğrencisiyim)\b"),
    re.compile(r"\bisg\s*[12](?:'?[dtn]e?n|'?(?:im|yi|i))?\s+(?:aldım|kaldı|geçtim|notum|dersim)\b"),
    re.compile(r"\bnotum\s+(?:dc|dd|cc|cb|bb|ba|aa|ff|fd|mu)\b"),
    re.compile(r"\bdevam\s+ediyor\b.*\b(?:staj|belge|uygun)\b"),
    re.compile(r"\bbenim\s+için\s+uygun\s+mu\b"),
    re.compile(r"\b(?:ben|bana)\s+(?:bu\s+yaz|sömestr(?:de|da)?)\s+staj\b"),
    re.compile(r"\bkesin\s+staj\s+belgesi\s+çıkarabilir\s+miyim\b"),
]

_SOURCE_INJECTION_LINE_RE = re.compile(
    r"(?:ignore\s+previous\s+instructions|<system>|\[INST\]|sistem\s+talimat)",
    re.IGNORECASE,
)


def mask_pii(text: str) -> PiiMaskResult:
    masked = text
    changed = False

    for pattern, token in (
        (_EMAIL_RE, "[MASKED_EMAIL]"),
        (_IBAN_RE, "[MASKED_IBAN]"),
        (_TR_PHONE_RE, "[MASKED_PHONE]"),
        (_TC_RE, "[MASKED_TC]"),
        (_STUDENT_NO_RE, "[MASKED_STUDENT_NO]"),
    ):
        new_text, count = pattern.subn(token, masked)
        if count > 0:
            changed = True
            masked = new_text

    def _replace_name(match: re.Match[str]) -> str:
        nonlocal changed
        changed = True
        prefix = match.group(0).split()[0]
        return f"{prefix} [MASKED_NAME]"

    masked = _NAME_INTRO_RE.sub(_replace_name, masked)
    return PiiMaskResult(masked_text=masked, pii_masked=changed)


def detect_prompt_injection(text: str) -> bool:
    return any(pattern.search(text) for pattern in _INJECTION_PATTERNS)


def isolate_untrusted_source(chunk_text: str) -> str:
    """Strips embedded imperative injection lines and isolates source text from instructions."""
    safe_lines = [line for line in chunk_text.splitlines() if not _SOURCE_INJECTION_LINE_RE.search(line)]
    return "\n".join(safe_lines).strip()


def detect_personal_eligibility_query(question: str) -> bool:
    lowered = question.lower()
    if any(pat.search(lowered) for pat in _PERSONAL_ELIGIBILITY_SIGNALS):
        return True
    # Also catch explicit individual grade + personal question ("CB aldım ... yapabilir miyim")
    has_grade = bool(_GRADE_TOKEN_RE.search(question))
    asks_personal = any(
        kw in normalize_turkish(question)
        for kw in ("aldim", "kaldim", "kaldi", "gectim", "uygun muyum", "yapabilir miyim", "belge cikarabilir")
    )
    return has_grade and asks_personal


def detect_source_conflicts(question: str, chunks: list[dict]) -> ConflictResult:
    """Detects substantive conflicts across distinct official sources on the same topic."""
    if len(chunks) < 2:
        return ConflictResult(conflict_detected=False)

    q_norm = normalize_turkish(question)
    distinct_sources = {c["source_id"] for c in chunks}
    if len(distinct_sources) < 2:
        return ConflictResult(conflict_detected=False)

    # 1) Saturday / 6-day workday conflict (Faculty Directive Madde 7 vs Department Karar 2026/04)
    if any(k in q_norm for k in ("cumartesi", "6 gun", "alti gun", "haftada 6")):
        sat_chunks = [c for c in chunks if "cumartesi" in normalize_turkish(c["content"])]
        by_source: dict[str, dict] = {}
        for c in sat_chunks:
            by_source.setdefault(c["source_id"], c)
        if len(by_source) >= 2:
            return ConflictResult(
                conflict_detected=True,
                conflict_summary=(
                    "Fakülte Staj Yönergesi (Madde 7) işletmenin çalışması hâlinde Cumartesi günlerinin "
                    "iş günü sayılabileceğini belirtirken, Bilgisayar Mühendisliği Bölümü Staj Komisyonu "
                    "Esasları (Karar 2026/04) varsayılan düzeni haftada 5 iş günü olarak sınırlandırır ve "
                    "Cumartesi için imzalı çalışma yazısı ile komisyon ön onayı şartı arar."
                ),
                conflicting_chunk_ids=tuple(c["chunk_id"] for c in by_source.values()),
            )

    # 2) Internship book / report submission deadline conflict (Madde 10: 15 workdays vs Karar 2026/06: 10 workdays)
    if any(k in q_norm for k in ("defter", "rapor")):
        sub_chunks = [
            c
            for c in chunks
            if "defter" in normalize_turkish(c["content"]) and "teslim" in normalize_turkish(c["content"])
        ]
        by_source_sub: dict[str, tuple[dict, set[str]]] = {}
        for c in sub_chunks:
            nums = set(re.findall(r"\b(10|15|20|30)\b", c["content"]))
            if nums and c["source_id"] not in by_source_sub:
                by_source_sub[c["source_id"]] = (c, nums)
        if len(by_source_sub) >= 2:
            all_nums = set().union(*(nums for _, nums in by_source_sub.values()))
            if len(all_nums) >= 2:
                return ConflictResult(
                    conflict_detected=True,
                    conflict_summary=(
                        "Fakülte Staj Yönergesi (Madde 10) staj defteri teslimi için dönemin ilk 15 iş gününü "
                        "tanımlarken, Bilgisayar Mühendisliği Bölümü Staj Komisyonu Esasları (Karar 2026/06) "
                        "ilk 10 iş günü içinde teslim şartı getirmiştir."
                    ),
                    conflicting_chunk_ids=tuple(c["chunk_id"] for c, _ in by_source_sub.values()),
                )

    return ConflictResult(conflict_detected=False)


def sanitize_error_summary(err: Exception | str) -> str:
    raw = str(err)
    # Strip secrets, bearer tokens, API keys, and PII
    cleaned = re.sub(r"sk-[a-zA-Z0-9_\-]{8,}", "[REDACTED_KEY]", raw)
    cleaned = re.sub(r"Bearer\s+[a-zA-Z0-9._\-]+", "Bearer [REDACTED]", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(?:api_key|secret|password|token)=[^\s,;]+", "[REDACTED_CRED]", cleaned, flags=re.IGNORECASE)
    cleaned = mask_pii(cleaned).masked_text
    return cleaned[:480]
