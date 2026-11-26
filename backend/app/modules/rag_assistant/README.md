# RAG Assistant Vertical Module (`rag_assistant`)

Sorumlu: Mehmet Emin  
Entegrasyon Bağımlılıkları (Tuncay): `app.core.database.get_db`, `app.modules.admin_auth.dependencies.get_current_admin`

## Özellikler
- `rag_sources`, `rag_documents` (`pgvector`), `rag_reindex_jobs` SQLAlchemy modelleri ve Alembic migration (`20261127_01_rag`).
- `FOR UPDATE SKIP LOCKED` + `worker_id` + `heartbeat_at` + `lease_expires_at` tabanlı dayanıklı `reindex_worker.py` (restart sonrası süresi dolmuş lease kurtarma ve retry sınırı).
- `POST /api/v1/admin/rag/reindex` (`202 Accepted` + çift kuyruk `409` koruması).
- `POST /api/v1/assistant/ask` için kaynak önceliği (`1 > 2 > 3`), çelişki tespiti, PII maskeleme, prompt injection koruması ve bireysel uygunluk yönlendirmesi.
- Transkript PDF'ine, öğrenci snapshot'ına veya HMAC belge tokenlarına kesinlikle erişim yoktur.
