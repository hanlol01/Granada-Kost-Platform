# Admin UX M7-D0 — Kontrak Dashboard Summary Canonical

> **Status:** Amendment dokumentasi normatif M7-D0 untuk dashboard Admin read-only; belum mengizinkan patch kode.
>
> **Authority utama M7:** `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §1, §2 DEC-12 dan DEC-15, §4 baris “M7 — Integrasi modul & dashboard”, serta §5 ownership dan batas file.
>
> **Authority pendukung terbatas:** `docs/hotfixes/REVISI_UX_ADMIN.md` Fase 6 “Dashboard Refresh” dan Verification Plan; `docs/plans/ADMIN_UX_FRONTEND_INTEGRATION.md` §3.3, §4.4, §5, dan Definition of Done Frontend.

## 1. Scope dan hierarchy authority

M7-D0 mengunci kontrak read-only dashboard Admin secara aditif. Endpoint `GET /api/v1/dashboard/summary` menjadi sumber canonical metric dashboard M7.

Client-side aggregation yang dicatat pada `docs/10-frontend/FRONTEND_INTEGRATION_PLAN.md` M11G adalah referensi/legacy, bukan sumber kebenaran metric M7. Jika perilakunya berbeda dari kontrak ini, kontrak M7-D0 berlaku untuk M7.

Dokumen ini tidak mengubah M7-A, M7-B0/B1, kode produk, test, M6, M8, CSV, route generated, manifest, atau kontrak domain lain.

## 2. Endpoint canonical dan boundary

| Item                     | Status               | Kontrak                                                                                                    | Referensi authority                                                                                                        |
| ------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Endpoint dashboard Admin | `EXISTING AUTHORITY` | `GET /api/v1/dashboard/summary`                                                                            | `docs/hotfixes/REVISI_UX_ADMIN.md` Fase 6                                                                                  |
| Scope request            | `EXISTING AUTHORITY` | Query `property_id`; seluruh snapshot wajib property-scoped                                                | `docs/hotfixes/REVISI_UX_ADMIN.md` Fase 6 dan API Smoke Tests; `docs/plans/ADMIN_UX_FRONTEND_INTEGRATION.md` §4.1 dan §5.1 |
| Mode integrasi           | `EXISTING AUTHORITY` | Read-only; tidak ada optimistic lifecycle mutation                                                         | `docs/plans/ADMIN_UX_M7_INTEGRATION_CONTRACT.md` §2; `docs/plans/ADMIN_UX_FRONTEND_INTEGRATION.md` §5.2–§5.3               |
| Sumber metric            | `EXISTING AUTHORITY` | Satu snapshot konsisten yang dihitung server; frontend tidak melakukan fan-out list untuk metric canonical | `docs/hotfixes/REVISI_UX_ADMIN.md` Fase 6; `docs/plans/ADMIN_UX_FRONTEND_INTEGRATION.md` §3.1 dan §6                       |
| Timezone                 | `EXISTING AUTHORITY` | Asia/Jakarta disertakan untuk label periode dan rekonsiliasi snapshot                                      | `docs/hotfixes/REVISI_UX_ADMIN.md` Fase 6 dan Verification Plan; `docs/plans/ADMIN_UX_FRONTEND_INTEGRATION.md` §4.1        |

M7-D0 tidak menciptakan endpoint activity, queues, reports, exports, mutation, atau endpoint dashboard lain.

## 3. Registry field authoritative

Field berikut adalah satu-satunya field dashboard summary yang telah memiliki authority M7-D0:

| Field                            | Status               | Authority                                 |
| -------------------------------- | -------------------- | ----------------------------------------- |
| `active_leases`                  | `EXISTING AUTHORITY` | `docs/hotfixes/REVISI_UX_ADMIN.md` Fase 6 |
| `active_residents`               | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6                 |
| `rooms_total`                    | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6                 |
| `rooms_vacant`                   | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6                 |
| `rooms_occupied`                 | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6                 |
| `rooms_maintenance`              | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6                 |
| `verified_revenue_current_month` | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6 dan Fase 7B     |
| `outstanding_amount`             | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6                 |
| `overdue_invoice_count`          | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6                 |
| `recent_leases`                  | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6                 |
| `recent_payments`                | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6                 |
| `urgent_maintenance_count`       | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6                 |
| Timestamp snapshot               | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6                 |
| Timezone Asia/Jakarta            | `EXISTING AUTHORITY` | Dokumen yang sama, Fase 6                 |

Nama field tidak dengan sendirinya membekukan rumus, query, tabel, agregasi, distinct semantics, batas periode, enum, pagination, atau shape item. Detail tersebut tetap mengikuti registry open decision.

## 4. Invariant lintas domain dan UI

1. Satu request wajib menghasilkan satu snapshot server-side yang konsisten. Frontend tidak boleh menghitung metric canonical dengan menggabungkan banyak endpoint list.
2. Semua metric dan recent items wajib dibatasi pada property yang telah diotorisasi. Query/cache key wajib menyertakan property scope dan data property lama dibersihkan saat property switch.
3. `verified_revenue_current_month` hanya berasal dari payment verified. Rumus detail serta boundary bulan berjalan belum dibekukan.
4. Respons, cache, breadcrumb, log, error, dan recent items dilarang membawa KTP penuh, URL/path file, detail PII berlebih, atau identifier mentah sebagai label manusia.
5. Layout authority Fase 6 dipertahankan: metric inti, overdue/maintenance, recent lease/payment, serta quick action Tambah Penyewaan dan Lihat Tagihan Overdue. Chart occupancy/revenue tetap enhancement opsional dan bukan blocker.
6. UI wajib membedakan loading, empty, error/retry, forbidden, background refetch, dan property-switch state. Data stale property sebelumnya tidak boleh dirender sebagai property baru.
7. Dashboard tetap read-only dan tidak menjalankan optimistic lifecycle mutation.

## 5. Registry keputusan yang belum selesai

| Topik                                  | Status                  | Keputusan yang masih diperlukan                                                                                        |
| -------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Implementasi kontrak dashboard lengkap | `NEW CONTRACT REQUIRED` | Seluruh open decision di bawah harus ditutup sebelum patch kode pertama.                                               |
| Formula dan sumber setiap metric       | `OPEN DECISION`         | Exact formula, authoritative query/table/read model, joins, distinct/count semantics, dan treatment data legacy.       |
| Boundary bulan berjalan                | `OPEN DECISION`         | Cutoff waktu, transaksi pada boundary Asia/Jakarta, serta definisi periode untuk revenue verified.                     |
| Outstanding                            | `OPEN DECISION`         | Definisi final `outstanding_amount`, status invoice/allocation yang dihitung, dan treatment invoice legacy.            |
| Overdue                                | `OPEN DECISION`         | Definisi final `overdue_invoice_count`, due-date boundary, status yang termasuk, dan duplicate prevention.             |
| Urgent maintenance                     | `OPEN DECISION`         | Definisi final `urgent_maintenance_count`, priority/status yang termasuk, serta source domain.                         |
| Recent leases                          | `OPEN DECISION`         | Item shape, whitelist field/PII, limit, ordering, tie-breaker, dan treatment lease historical/transferred.             |
| Recent payments                        | `OPEN DECISION`         | Item shape, whitelist field/PII, limit, ordering, tie-breaker, dan status payment yang termasuk.                       |
| Response envelope                      | `OPEN DECISION`         | Exact success envelope sesuai DEC-15, error envelope, correlation metadata, timestamp placement, dan casing wire.      |
| RBAC/capability                        | `OPEN DECISION`         | Concrete roles, permission/capability name, property access resolution, direct-URL guard, dan denial status/semantics. |
| `property_id` edge cases               | `OPEN DECISION`         | Perilaku saat hilang, invalid, tidak berhak, atau aktor memiliki multiple properties.                                  |
| Refresh/cache                          | `OPEN DECISION`         | Refresh interval, stale time, cache duration, refetch trigger, dan apakah timestamp menandai awal atau akhir snapshot. |
| Uang BIGINT                            | `OPEN DECISION`         | Wire serialization rupiah dan representasi client yang aman dari overflow/precision loss.                              |
| Room maintenance                       | `OPEN DECISION`         | Apakah `rooms_maintenance` juga mencakup `requires_review` atau `inactive`; tidak boleh diinfer.                       |
| Performance                            | `OPEN DECISION`         | Query plan, performance budget, observability, dan threshold exact untuk “tidak ada N+1 kritis”.                       |
| Kompatibilitas dan rollout             | `OPEN DECISION`         | Public/legacy regression evidence, feature/capability rollout, dan property canary untuk slice dashboard.              |

Tidak ada field, formula, role, permission, table, payload, refresh policy, atau endpoint tambahan yang boleh diinfer dari nama metric maupun dari implementasi legacy M11G.

## 6. Acceptance gate M7-D0

M7-D0 selesai sebagai kontrak dokumentasi bila:

1. `GET /api/v1/dashboard/summary` tercatat sebagai satu-satunya endpoint canonical M7 dashboard;
2. seluruh field authoritative memiliki referensi dokumen dan section;
3. M11G client aggregation ditandai reference/legacy, bukan sumber metric;
4. property scope, satu snapshot konsisten, Asia/Jakarta, server-derived metric, read-only behavior, PII boundary, cache boundary, dan state UI bersifat normatif;
5. setiap detail formula, source, RBAC, payload, envelope, refresh, performance, dan compatibility yang belum berotoritas tetap berstatus `OPEN DECISION` atau `NEW CONTRACT REQUIRED`;
6. tidak ada endpoint, formula, role, permission, field, table, payload, atau refresh policy di luar authority tertulis yang diciptakan;
7. tidak ada patch kode dashboard sebelum amendment berikutnya menutup seluruh keputusan yang relevan.
