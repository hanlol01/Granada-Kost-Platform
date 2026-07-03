# Granada Kost Platform Documentation

Indeks dokumentasi proyek. Untuk status milestone terbaru (M12 File Upload Foundation dan seterusnya), sumber kebenaran adalah dokumen implementasi di `12-product-readiness/` dan ADR di `01-architecture/` — bukan ringkasan high-level.

## Struktur Direktori

| Direktori | Isi |
| --- | --- |
| `00-project/` | Project governance: `ROADMAP.md`, `CHANGELOG.md`, `BACKLOG.md`, `PROJECT_MASTER.md`, `PROJECT_HEALTH_REVIEW_V1.md`, `INTERNAL_DEMO_CHECKLIST.md`, `PROJECT_HANDOFF.md`, `DEVELOPMENT_WORKFLOW.md`, `AGENTS.md` |
| `01-architecture/` | Arsitektur global: `BACKEND_ARCHITECTURE.md`, `API_PLANNING.md`, `DATABASE_PLANNING.md`, `DOMAIN_MODEL.md`, `SECURITY_POLICY.md`, `ARCHITECTURE_DECISIONS.md`, `FRONTEND_ARCHITECTURE_DECISIONS.md` (ADR-FE-001..011, frozen M11AF), `ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md` |
| `02-domains/` | Business domains: Billing, Complaint, Vehicle, Notification, Smart Lock, CCTV |
| `03-database/` | Database planning per domain |
| `04-smartlock/` | Smart Lock architecture, policy, business guide, Tuya compatibility audit |
| `05-master-data/` | Master data dan seed plan |
| `06-analysis/` | Research dan gap analysis |
| `07-reports/` | Laporan mingguan untuk stakeholder |
| `09-progress/` | Progress mingguan internal (`Week_1_Kostation.md`, `Week_2_Kostation.md`, `Week_3_Kostation.md`) |
| `10-frontend/` | Frontend integration plan (M11) |
| `11-qa/` | QA dan bug triage |
| `12-product-readiness/` | Product readiness dan File Upload Foundation (M12) |
| `13-smart-lock/` | Smart Lock live Tuya/PALOMA readiness (M13): `SMART_LOCK_TUYA_SITE_READINESS_PLAN.md` (M13A site readiness plan; legacy PoC `reference/tuya-paloma-poc/` diaudit sebagai referensi saja), `SMART_LOCK_LIVE_INTEGRATION_ARCHITECTURE_FREEZE.md` (M13B architecture freeze — binding untuk M13C–M13H) |

## File Upload, Payment Proof, dan Complaint Attachment (M12)

Seluruh dokumen milestone M12 berada di `12-product-readiness/`:

| Topik | Dokumen |
| --- | --- |
| ADR akses file backend-mediated (binding) | `01-architecture/ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md` |
| Mockup feature gap audit (M12A) | `12-product-readiness/MOCKUP_FEATURE_GAP_AUDIT.md` |
| Feature flag / placeholder hardening (M12B) | `12-product-readiness/FEATURE_FLAG_PLACEHOLDER_HARDENING.md` |
| Rencana arsitektur File Upload (M12C) | `12-product-readiness/FILE_UPLOAD_FOUNDATION_PLAN.md` |
| Implementasi Backend File API (M12C1) | `12-product-readiness/FILE_UPLOAD_FOUNDATION_IMPLEMENTATION.md` |
| Rencana generic upload engine frontend (M12C2) | `12-product-readiness/GENERIC_UPLOAD_ENGINE_PLAN.md` |
| Implementasi generic upload engine frontend (M12C2) | `12-product-readiness/GENERIC_UPLOAD_ENGINE_IMPLEMENTATION.md` |
| Penghuni Manual Payment Proof Upload (M12C3) | `12-product-readiness/MANUAL_PAYMENT_PROOF_UPLOAD_IMPLEMENTATION.md` |
| Complaint Attachment Backend Readiness (M12C4) | `12-product-readiness/COMPLAINT_ATTACHMENT_BACKEND_READINESS.md` |
| Admin File Preview / Review (M12C5) | `12-product-readiness/ADMIN_FILE_PREVIEW_REVIEW_IMPLEMENTATION.md` |
| Penghuni Complaint Create UI + Attachment (M12D) | `12-product-readiness/PENGHUNI_COMPLAINT_CREATE_ATTACHMENT_IMPLEMENTATION.md` |

## Prinsip Arsitektur (Ringkas)

- Backend adalah titik penegakan kebijakan final. Validasi frontend bersifat UX-only.
- PostgreSQL adalah system of record. Redis hanya untuk runtime/cache/queue/rate-limit.
- Property scoping wajib. Resident self-scope ditegakkan oleh backend.
- Tidak ada URL file publik. Preview file menggunakan akses terotorisasi yang dimediasi backend. `storage_path` tidak pernah diekspos ke frontend.
- Tidak didukung pada fase ini: video upload, chat attachment.
- Milestone mendatang: payment gateway (Midtrans), receipt/nota, Smart Lock live Tuya/PALOMA, CCTV live.
