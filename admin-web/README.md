# Staj Yardımcısı — React Web Admin Paneli (`admin-web/`)

Sorumlu: Mehmet Emin  
Teknoloji Yığını: React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui bileşenleri, React Flow (`@xyflow/react`), Zod, TanStack Query.

## Ortam Değişkenleri (`.env.example`)
- `VITE_API_BASE_URL`: Backend API adresi (varsayılan `http://localhost:8000`)
- `VITE_USE_MOCK_API`: `true` iken backend olmadan v3.1 mock store üzerinden çalışır; `false` yapıldığında gerçek FastAPI uçlarına (`credentials: "include"` refresh rotasyonu ile) bağlanır.

## Modüller (`src/features/`)
- `auth/`: Admin girişi, bellek içi access JWT + cookie refresh interceptor, `/me`, logout.
- `rule-matrix/`: Dinamik 5+ yıl matrisi, global şalterler, `period_overrides` editörü (Zod ile `Y1_SEM` ve tarih çakışması doğrulaması) ve taslak kaydetme (`PATCH`).
- `flowchart-viewer/`: `matrixToGraph` ile canlı React Flow düğüm/ok diyagramı, Mermaid (`.mmd`) ve SVG dışa aktarımı.
- `version-history/`: Standart profil simülasyonu/diff (`/simulate`), komisyon onayıyla yayınlama (`/publish`) ve yeni sürüm üreten rollback (`/rollback`).
- `academic-calendar/`: Akademik staj pencereleri (`academic_periods`) ve resmî/dinî/yarım gün tatiller (`calendar_days`).
- `course-aliases/`: İSG 1 ve İSG 2 alternatif ders kodu yönetimi.
- `templates/`: `.docx` şablon yükleme, indirme, atomik aktivasyon (`PATCH /activate`) ve soft archive.
- `rag-knowledge/`: Resmî RAG kaynakları CRUD, manuel reindex kuyruğu (`202 Accepted` + çift kuyruk `409` koruması), canlı job izleme ve guardrail test konsolu.

## Komutlar
```bash
npm install
npm run dev
npm test -- --run
npm run build
```
