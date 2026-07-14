# Admin UX M7-A — Kontrak Integrasi Modul dan Dashboard

> **Status:** Kontrak dokumentasi normatif M7-A; belum mengizinkan patch kode M7.
>
> **Authority tunggal:** `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md`, khususnya §1, §2 DEC-12 dan DEC-15, §4 tabel “M7 — Integrasi modul & dashboard”, serta §5 ownership dan batas file.

## 1. Status, authority, dan non-goals

M7 mencakup integrasi **invoice, payment, tenant, vehicle, parking, report,
notification, dan dashboard**. Vehicle dan parking menjadi domain M7 hanya
karena disebut eksplisit dalam
`docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris
“M7 — Integrasi modul & dashboard”.

Status normatif dalam dokumen ini bersifat eksklusif:

- `EXISTING AUTHORITY`: kontrak dinyatakan eksplisit oleh authority.
- `NEW CONTRACT REQUIRED`: authority mewajibkan integrasi domain, tetapi
  kontrak implementasinya belum ditetapkan dan harus disetujui sebelum kode.
- `OPEN DECISION`: authority belum menetapkan detail yang diperlukan;
  implementasi dilarang sampai keputusan disetujui.

CSV **deferred dan di luar M7-A; inclusion pada patch M7 berikutnya memerlukan
amendment authority**.

M6 release candidate, M8, kode produk, test, migration, seed, implementasi API,
implementasi UI, route generated, serta mutasi Git selain keberadaan file baru
ini berada di luar scope.

Dokumen ini tidak memberikan authority untuk menginfer rumus metric, agregasi,
periode, refresh, tabel, payload, endpoint, capability, permission, atau nama
feature flag.

## 2. Aturan lintas-domain

1. **Property scope.** Semua data M7 wajib dibatasi pada properti yang berhak
   diakses aktor. Query key, cache, dan render state tidak boleh mencampur data
   antarproperti. Referensi:
   `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §2 DEC-12 dan §4 baris M7.
2. **PII masking dan larangan data.** List wajib memakai masking. KTP penuh dan
   URL/path file dilarang masuk response Admin, UI state, cache, audit, business
   event, atau notification. Detail PII hanya boleh tersedia bagi owner,
   manager, atau admin pada properti yang berhak. Property owner dan technician
   tidak boleh melihat detail lease atau PII. Referensi:
   `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §2 DEC-12.
3. **State UI.** Setiap integrasi wajib membedakan loading, empty, error, dan
   forbidden. Empty tidak boleh menyamarkan error atau forbidden. Data stale
   dari properti sebelumnya tidak boleh ditampilkan selama pergantian properti.
4. **Capability dan feature guard.** Route, menu, query, dan action wajib
   fail-closed ketika capability, permission, atau feature authority belum
   tersedia. Nama guard atau flag M7 tidak boleh diinfer. Referensi:
   `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §5, area
   “UI lease/integrasi”.
5. **Wire compatibility.** Wire baru memakai snake_case; list baru memakai
   `data/meta`, sedangkan detail memakai `data`. URL lama mempertahankan bentuk
   lama. Pada URL lama yang juga menyediakan V2, Admin memakai media type yang
   ditetapkan authority sampai cutover selesai. Endpoint baru tidak memerlukan
   header tersebut. Referensi:
   `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §2 DEC-15.
6. **Read-only integration.** M7 tetap read-only sampai kontrak write terpisah
   disetujui. Tidak ada optimistic lifecycle mutation. Referensi:
   `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §5, area
   “UI lease/integrasi”.

## 3. Matriks sumber data dan metric dashboard

Penyebutan domain dalam authority mewajibkan kontrak integrasi domain, tetapi
tidak menetapkan sumber data spesifik, tabel, read model, payload, endpoint,
rumus, agregasi, periode, atau refresh.

| Domain/metric                           | Status                  | Sumber authoritative                                   | Referensi authority                                                                       | Batas normatif                                                                         |
| --------------------------------------- | ----------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Invoice — kontrak integrasi domain      | `NEW CONTRACT REQUIRED` | M7 mewajibkan integrasi invoice                        | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7                                   | Kontrak implementasi harus disetujui sebelum patch kode.                               |
| Invoice — sumber data spesifik          | `OPEN DECISION`         | Belum ditetapkan                                       | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7 hanya menetapkan scope domain     | Jangan infer tabel, read model, payload, agregasi, periode, refresh, atau endpoint.    |
| Payment — kontrak integrasi domain      | `NEW CONTRACT REQUIRED` | M7 mewajibkan integrasi payment                        | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7                                   | Kontrak implementasi harus disetujui sebelum patch kode.                               |
| Payment — sumber data spesifik          | `OPEN DECISION`         | Belum ditetapkan                                       | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7 hanya menetapkan scope domain     | Jangan infer tabel, read model, payload, agregasi, periode, refresh, atau endpoint.    |
| Tenant — kontrak integrasi domain       | `NEW CONTRACT REQUIRED` | M7 mewajibkan integrasi tenant                         | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7                                   | Kontrak wajib mempertahankan kompatibilitas resident tanpa lease aktif.                |
| Tenant — sumber data spesifik           | `OPEN DECISION`         | Belum ditetapkan                                       | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris dan gate M7                          | Jangan menyamakan tenant, resident, occupancy, atau lease tanpa authority eksplisit.   |
| Vehicle — kontrak integrasi domain      | `NEW CONTRACT REQUIRED` | M7 mewajibkan integrasi vehicle                        | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7                                   | Vehicle adalah domain M7 hanya berdasarkan authority ini.                              |
| Vehicle — sumber data spesifik          | `OPEN DECISION`         | Belum ditetapkan                                       | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7 hanya menetapkan scope domain     | Jangan infer tabel, read model, payload, agregasi, periode, refresh, atau endpoint.    |
| Parking — kontrak integrasi domain      | `NEW CONTRACT REQUIRED` | M7 mewajibkan integrasi parking                        | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7                                   | Parking adalah domain M7 hanya berdasarkan authority ini.                              |
| Parking — sumber data spesifik          | `OPEN DECISION`         | Belum ditetapkan                                       | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7 hanya menetapkan scope domain     | Jangan infer tabel, read model, payload, agregasi, periode, refresh, atau endpoint.    |
| Report — kontrak integrasi domain       | `NEW CONTRACT REQUIRED` | M7 mewajibkan integrasi report                         | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7                                   | Kontrak implementasi harus disetujui sebelum patch kode.                               |
| Report — sumber data spesifik           | `OPEN DECISION`         | Belum ditetapkan                                       | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7 hanya menetapkan scope domain     | Jangan infer jenis laporan, tabel, payload, agregasi, periode, refresh, atau endpoint. |
| Notification — kontrak integrasi domain | `NEW CONTRACT REQUIRED` | M7 mewajibkan integrasi notification                   | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7 dan §2 DEC-12                     | Kontrak wajib melarang PII terlarang masuk notification atau cache.                    |
| Notification — sumber data spesifik     | `OPEN DECISION`         | Belum ditetapkan                                       | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7 hanya menetapkan scope domain     | Jangan infer read model, payload, status, filter, refresh, atau endpoint.              |
| Dashboard — kontrak integrasi domain    | `NEW CONTRACT REQUIRED` | M7 mewajibkan dashboard summary dari sumber yang benar | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7                                   | Kontrak implementasi harus menetapkan sumber yang benar sebelum patch kode.            |
| Dashboard — daftar dan definisi metric  | `OPEN DECISION`         | Belum ditetapkan                                       | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7 tidak menyebut metric individual  | Jangan infer nama metric, rumus, agregasi, periode, timezone, atau refresh.            |
| Dashboard — sumber data spesifik        | `OPEN DECISION`         | Belum ditetapkan                                       | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7 hanya mensyaratkan “sumber benar” | Jangan infer tabel, read model, payload, query, atau endpoint.                         |

Tidak ada metric dashboard individual yang boleh diimplementasikan sampai nama,
definisi, sumber authoritative, property scope, agregasi, periode/timezone, dan
aturan refresh-nya disetujui.

## 4. Registry endpoint per domain

Authority belum menetapkan method atau path endpoint M7. DEC-15 hanya mengatur
bentuk wire dan kompatibilitas setelah suatu endpoint memiliki kontrak; DEC-15
bukan authority untuk menciptakan endpoint.

| Domain       | Status          | Endpoint authoritative         | Referensi authority                                                                                                               |
| ------------ | --------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Invoice      | `OPEN DECISION` | Tidak ada endpoint berotoritas | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7; §2 DEC-15 hanya mengatur wire/versioning                                 |
| Payment      | `OPEN DECISION` | Tidak ada endpoint berotoritas | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7; §2 DEC-15 hanya mengatur wire/versioning                                 |
| Tenant       | `OPEN DECISION` | Tidak ada endpoint berotoritas | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7; §2 DEC-15 hanya mengatur wire/versioning                                 |
| Vehicle      | `OPEN DECISION` | Tidak ada endpoint berotoritas | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7; §2 DEC-15 hanya mengatur wire/versioning                                 |
| Parking      | `OPEN DECISION` | Tidak ada endpoint berotoritas | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7; §2 DEC-15 hanya mengatur wire/versioning                                 |
| Report       | `OPEN DECISION` | Tidak ada endpoint berotoritas | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7; §2 DEC-15 hanya mengatur wire/versioning                                 |
| Notification | `OPEN DECISION` | Tidak ada endpoint berotoritas | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7; §2 DEC-12 menetapkan batas PII; §2 DEC-15 hanya mengatur wire/versioning |
| Dashboard    | `OPEN DECISION` | Tidak ada endpoint berotoritas | `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4, baris M7; §2 DEC-15 hanya mengatur wire/versioning                                 |

Endpoint kandidat tidak boleh ditambahkan ke backlog kode. Registry hanya dapat
diubah melalui kontrak yang menyertakan authority dokumen dan section secara
eksplisit.

## 5. Kontrak UI Admin dan acceptance criteria M7-A

- Pergantian properti wajib menjadi cache boundary: query/cache key menyertakan
  property scope dan data properti sebelumnya tidak boleh dirender sebagai data
  properti baru.
- Masking dan larangan data mengikuti
  `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §2 DEC-12. Field terlarang tidak
  boleh sekadar disembunyikan setelah masuk UI state atau cache.
- Route, menu, query, dan action wajib tunduk pada permission, capability, serta
  feature guard yang memiliki authority. Guard yang belum ditetapkan wajib
  fail-closed.
- Setiap domain wajib membedakan loading, empty, error, dan forbidden tanpa
  fallback yang menyesatkan.
- Integrasi tetap read-only dan tidak menjalankan optimistic lifecycle mutation.
- Ownership patch lanjutan mengikuti
  `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §5: area
  tenants/payments/vehicles/parking/notifications/dashboard dimiliki Frontend
  Lease/Integrasi; perubahan hotspot foundation atau backend memerlukan handoff
  kepada owner terkait; `routeTree.gen.ts` tidak diedit manual.

M7-A selesai hanya bila:

1. setiap domain, sumber data, metric, dan endpoint tercatat dengan tepat satu
   status yang diizinkan;
2. setiap klaim authority menyertakan referensi dokumen dan section;
3. tidak ada rumus, agregasi, periode, refresh, tabel, payload, endpoint,
   capability, permission, atau flag yang diinfer;
4. seluruh `NEW CONTRACT REQUIRED` dan `OPEN DECISION` dibawa ke handoff patch
   berikutnya dan tidak diterjemahkan langsung menjadi kode.

## 6. Open decisions dan handoff M7-B

Keputusan berikut wajib disetujui sebelum patch kode M7 pertama:

1. Kontrak implementasi untuk masing-masing domain invoice, payment, tenant,
   vehicle, parking, report, notification, dan dashboard.
2. Sumber authoritative/read model setiap domain.
3. Definisi tenant dan relasinya dengan resident, occupancy, serta lease,
   termasuk kompatibilitas resident tanpa lease aktif.
4. Daftar metric dashboard beserta definisi, rumus, property scope, agregasi,
   periode/timezone, sumber authoritative, dan kebijakan refresh.
5. Method/path endpoint per domain, klasifikasi legacy/V2/new,
   request/response, pagination, error contract, dan aturan media type sesuai
   DEC-15.
6. Matriks role, permission, capability, dan field visibility per domain yang
   melengkapi batas PII DEC-12.
7. Feature dan rollout guard M7 per properti; nama atau urutan flag tidak boleh
   dibuat tanpa amendment authority.
8. Semantik read model notification dan report, termasuk status/filter yang
   boleh diekspos tanpa PII.
9. Strategi query dan acceptance evidence untuk memenuhi gate “tidak ada N+1
   kritis”, kompatibilitas resident tanpa lease aktif, dan public regression.
10. Ownership work item untuk setiap perubahan hotspot authority §5 sebelum
    stream Backend/API dan Frontend Integrasi berjalan paralel.
11. Keputusan inclusion CSV pada patch M7 berikutnya; inclusion memerlukan
    amendment authority.
