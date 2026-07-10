# Admin UX — Kontrak Final, Backlog, dan File Ownership

> **Status: MENUNGGU PERSETUJUAN KONTRAK.** Dokumen ini menyatukan desain database/API, integrasi frontend, serta strategi QA/release. Tidak ada implementasi kode, migration, seed, atau perubahan feature flag yang boleh dimulai sebelum pemilik produk menyetujuinya secara eksplisit.

## 1. Otoritas dokumen

Setelah disetujui, dokumen ini menjadi amendment yang mengikat untuk:

1. **docs/hotfixes/REVISI_UX_ADMIN.md**
2. **docs/plans/ADMIN_UX_DB_API_DESIGN.md**
3. **docs/plans/ADMIN_UX_FRONTEND_INTEGRATION.md**
4. **docs/plans/ADMIN_UX_QA_RELEASE_STRATEGY.md**

Keempat dokumen sumber tetap menjadi referensi detail. Bila ada perbedaan,
prioritasnya adalah **dokumen ini → Fase 0 hotfix → desain DB/API → integrasi
frontend → strategi QA/release**. Contoh lama yang bertentangan tidak boleh
diterjemahkan menjadi perilaku aplikasi.

Scope tetap Admin, API/database pendukung, dan kompatibilitas endpoint lama.
Halaman publik tidak berubah pada rilis ini.

Apabila preflight M0 menemukan anomali data, remediasi staging wajib mengikuti
[ADMIN_UX_M0_REMEDIATION_RUNBOOK.md](ADMIN_UX_M0_REMEDIATION_RUNBOOK.md).
Runbook tersebut tidak membuka M2 sendiri; seluruh gate M0 pada dokumen ini
tetap harus lulus.

## 2. Keputusan final yang membekukan kontrak

| ID | Keputusan final | Konsekuensi implementasi |
|---|---|---|
| DEC-01 | **Kost type adalah sumber kebenaran.** Harga, deposit, ukuran, fasilitas, aturan, dan galeri berada pada kost type; room adalah inventori fisik dan snapshot legacy. | POST/PATCH room tidak menerima harga, deposit, atau fasilitas. Mutation kost type menyinkronkan snapshot legacy dalam transaksi yang sama. |
| DEC-02 | **Lease adalah sumber komersial.** Setiap lease baru memiliki tepat satu occupancy unik; occupancy legacy tanpa lease tidak dibackfill secara heuristik. | Check-in/check-out lama tidak boleh lagi menciptakan occupancy baru setelah lease cutover. |
| DEC-03 | **Migration fail-closed terhadap data ambigu.** Migration 016/017 forward-only, additive, dan reentrant. | Tidak boleh memilih harga, deposit, fasilitas, atau kategori dengan mode, minimum/maksimum, nilai acak, maupun tebakan. Preflight harus bersih, atau operator melakukan koreksi data yang diaudit sebelum migration. |
| DEC-04 | **Dasar waktu dan uang tunggal.** Uang adalah BIGINT rupiah tanpa desimal; tanggal bisnis adalah DATE Asia/Jakarta; audit adalah TIMESTAMPTZ. | Validasi hari ini, due date, billing cycle, dan effective date dilakukan di server dengan Asia/Jakarta, bukan jam browser. |
| DEC-05 | **Tidak ada future lease pada V1.** Create lease hanya menerima start_date sama dengan hari ini Asia/Jakarta. | Invoice pertama langsung issued dalam transaksi create. Scheduled lease, reservasi kamar, dan cancel-before-start tidak diimplementasikan. Booking lead tetap tidak menciptakan lease/occupancy. |
| DEC-06 | **Transfer hanya efektif hari ini pada V1.** Rentang hunian memakai interval half-open: [start_date, end_date). | Lease/occupancy sumber berakhir pada effective_date dengan status transferred; target mulai tanggal yang sama. Tidak ada transfer bertanggal masa depan. |
| DEC-07 | **Transfer tanpa proration.** Invoice yang sudah dibuat tetap milik lease sumber dan piutang tidak dipindahkan. | Target memakai harga snapshot kamar baru mulai cycle berikutnya memakai billing anchor lama. Jika transfer tepat di awal cycle sebelum invoice dibuat, invoice cycle itu dibuat untuk target; selain itu tidak ada invoice target tambahan di tengah cycle. |
| DEC-08 | **Deposit adalah ledger append-only.** Nominal selalu non-negatif dengan arah credit/debit; payments hanya mencatat uang masuk positif. | Collection/top-up adalah credit; deduction/refund debit; carry-forward transfer ditulis sebagai pasangan debit/credit yang terkait transfer record. Refund bukan payment negatif. |
| DEC-09 | **Refund boleh pending.** Checkout menutup posisi komersial; pencairan kas diselesaikan terpisah. | Close dapat membuat refund pending. Endpoint settlement/waive mengubah status pencairan dan mencatat referensi, tanpa mengubah total ledger. |
| DEC-10 | **Collect deposit langsung harus sudah verified.** | Collect mewajibkan method serta external/internal reference. Flow bukti transfer asinkron tidak membuat collection ledger sebelum payment berstatus verified. |
| DEC-11 | **Least privilege finansial.** Role admin tidak memperoleh billing.manage pada rilis ini. | Owner/manager dengan lease.manage dan billing.manage dapat collect, close, serta settle refund. Admin dapat mengelola non-finansial dan transfer sesuai permission, tetapi aksi finansial ditolak 403. |
| DEC-12 | **PII dan KTP dibatasi property scope.** | KTP/file hanya untuk owner, manager, atau admin pada properti yang berhak. List masking; URL/path file dan KTP penuh tidak masuk response, audit, business event, atau notification. Property owner/technician tidak melihat detail lease atau PII. |
| DEC-13 | **Area bersama galeri V1 memakai allowlist.** | common_area_key hanya lobby, dapur, rooftop, koridor, atau parkir. Tidak dibuat tabel common_areas; nilai lain menghasilkan 422. |
| DEC-14 | **Room status operasional dipisah dari lifecycle lease.** | Endpoint room hanya boleh membuat vacant menjadi maintenance/inactive/requires_review atau memulihkan status itu ke vacant dengan resolution_reason, tanpa lease/occupancy aktif, dan kost type valid. Hanya LeaseService yang menulis occupied/vacant untuk room berpenghuni. Reserved tidak dibuat flow baru. |
| DEC-15 | **Kontrak baru V2 tetap kompatibel.** Wire baru snake_case; list baru memakai data/meta dan detail/mutation memakai data. | URL lama mempertahankan bentuk lama. Pada URL lama yang juga menyediakan V2, Admin mengirim Accept: application/vnd.granada.admin-ux.v2+json sampai cutover selesai. Endpoint baru tidak memerlukan header. |
| DEC-16 | **Idempotency dan outbox adalah bagian transaction.** | Lifecycle, upload/reorder galeri, dan reorder master memakai Idempotency-Key durable. Fingerprint, hasil final, audit ringkas, dan business event tersimpan atomik; provider/notifikasi berjalan setelah commit dan dapat retry. |
| DEC-17 | **Runner migration tidak direfaktor diam-diam.** | Karena runner sekarang menjalankan semua SQL tiap invocation, 016/017 wajib reentrant dan diuji dua kali pada database disposable. Redesign schema_migrations adalah work item platform terpisah. |
| DEC-18 | **Rollout memakai flag backend per property.** | Urutan flag: admin_ux_read, lease_write, lease_transfer, lalu lease_billing_scheduler. Tidak ada enable menu/endpoints write global sekaligus. |

### 2.1 Kontrak lifecycle

| Perintah | Precondition final | Hasil atomik final |
|---|---|---|
| Buat lease | Resident aktif, room vacant, kost type aktif, start_date hari ini, tidak ada lease/occupancy aktif untuk room atau resident. | Lock room/resident; buat occupancy dan lease active; room occupied; invoice pertama issued; history, audit, idempotency result, dan outbox dibuat sekali. |
| Collect deposit | Lease aktif, nominal positif, payment sudah verified, aktor memiliki lease.manage dan billing.manage. | Buat atau hubungkan payment incoming dan ledger collection/top-up; hitung ulang cache saldo; tulis history/audit/outbox. |
| Checkout | Lease aktif, aktor mempunyai dua permission finansial, deduction/refund valid. | Hentikan invoice berikutnya, tutup occupancy/lease, buat deduction/refund eksplisit, room menjadi vacant atau status operasional yang sah. Refund boleh pending. |
| Settle/waive refund | Lease closed, refund pending ada, aktor memiliki billing.manage. | Hanya status settlement dan metadata pencairan berubah; total credit/debit deposit tidak berubah. |
| Transfer | Lease aktif, room tujuan vacant, effective_date hari ini, alasan wajib, aktor memiliki lease.manage. | Lock kedua room/resident; tutup sumber transferred; buat target active; bawa credit deposit; pertahankan billing anchor; buat transfer record, dua history event, audit, idempotency result, dan outbox. |

Konflik status, double submit dengan payload berbeda, room tidak tersedia, dan
scope properti yang salah harus menghasilkan error deterministik (403, 409, atau
422), bukan best effort.

## 3. Register kontradiksi yang telah ditutup

| Topik | Ketidakselarasan semula | Resolusi yang berlaku |
|---|---|---|
| Future lease/cancel | Hotfix membuat invoice saat create tetapi masih memuat batal sebelum mulai; desain DB menandai future start sebagai pertanyaan. | DEC-05: hanya start hari ini; tidak ada scheduled lease/cancel-before-start V1. |
| Transfer tengah cycle | Dokumen menyebut no-proration tanpa boundary tanggal dan cycle target yang sepenuhnya tegas. | DEC-06/07: half-open interval, transfer hari ini, invoice lama tetap sumber, target mulai cycle berikutnya kecuali cycle belum di-invoice. |
| Refund checkout | Hotfix menetapkan ledger refund, tetapi desain DB membuka pending versus mandatory settlement. | DEC-09: close boleh refund pending; settlement/waive eksplisit dan auditable. |
| Otoritas finansial admin | Desain DB mensyaratkan billing.manage, sedangkan seed admin lama belum memilikinya. | DEC-11: permission tidak diperluas ke admin. |
| Common area | Desain galeri membuka pilihan key atau tabel master. | DEC-13: allowlist key V1; tabel master ditunda. |
| Recovery room | Invariant awal tidak menyediakan flow jelas dari maintenance/inactive/requires_review ke vacant. | DEC-14: transition recovery tertutup dengan alasan dan verifikasi tanpa hunian aktif. |
| API legacy/V2 | Frontend perlu V2, sementara bentuk respons lama tidak boleh berubah. | DEC-15: adapter/version negotiation memakai Accept header pada URL lama. |
| Runner migration | QA menemukan migration dijalankan ulang setiap invocation. | DEC-17: migration reentrant dan verifier dua kali; runner refactor dipisahkan dari scope. |

## 4. Backlog implementasi per milestone

Semua milestone berstatus **belum dimulai** sampai kontrak ini disetujui. Gate
adalah bukti yang harus ada sebelum milestone/flag berikutnya dibuka.

| Milestone | Scope dan hasil | Dependensi | Owner utama | Gate selesai |
|---|---|---|---|---|
| M0 — Kontrak & preflight | Persetujuan kontrak; inventory endpoint legacy; preflight per property untuk kategori room/building, harga/deposit, fasilitas, room type, occupancy aktif, dan file PII. Tetapkan runbook koreksi data operator. | — | Integrator + Backend/DB + QA | Kontrak disetujui; anomali tidak lagi ambigu; baseline legacy/public direkam. |
| M1 — Fondasi QA/release | Database disposable, test runner, baseline contract, verifier migration, fixture dua properti sintetis, dan aggregate release gate. | M0 | QA/Release | Command dapat diulang dan tidak memutasi production. Dapat berjalan paralel dengan M2/M3. |
| M2 — Schema 016 & master backend | Migration 016: kost type, fasilitas/rules, resident/file extension, room relation/snapshot, gallery target, constraint/index additive, lease.read RBAC, validator/preflight, adapter master legacy/public. | M0 | Backend Master + Backend/DB | Migration reentrant dua kali; no heuristic backfill; invariant dan legacy/public read regression lulus. |
| M3 — Fondasi frontend | Route registry, access boundary, typed client/mapper, query key factory, sidebar/breadcrumb/mobile nav, feature/capability guard, serta redirect kompatibilitas. | M0 | Frontend Foundation | Tidak ada konflik rooms.tsx versus rooms/index.tsx; lint/typecheck/build lulus; UI baru belum aktif tanpa flag. |
| M4 — UI master/room | Ringkasan/tipe kamar, fasilitas, aturan, galeri, inventory/detail room, resident profile, dan file UI. | M2 + M3 | Frontend Master | Browser flow master/read lulus; harga/fasilitas tidak dapat diedit dari form room; redirect kompatibilitas teruji. |
| M5 — Schema 017 & lease core | Migration 017: lease/history/transfer/deposit ledger/invoice extension/idempotency/outbox; LeaseModule, transaction/lock, create/read/update/collect/close/refund-settle, PII/file adapter. | M2 | Backend Lifecycle | Replay idempotensi, konflik dua admin, rollback, financial RBAC, sanitasi PII, dan invoice pertama lulus integration test. |
| M6 — Lease UX, transfer, scheduler | List/detail/create/checkout lease; kemudian transfer preview/command, carry-forward ledger, scheduler 00:10 Jakarta, advisory lock, SKIP LOCKED, catch-up 12 cycle, observability. | M5; UI master dari M4 untuk flow lengkap | Backend Lifecycle lalu Frontend Lease | Test akhir bulan/tahun kabisat, retry, dua instance scheduler, transfer tengah cycle, serta room contention lulus. |
| M7 — Integrasi modul & dashboard | Invoice/payment/tenant/vehicle/parking/report/notification integration, dashboard summary dari sumber benar, dan CSV property-scoped/audited bila masih scope. | M4 + M5/M6 sesuai domain | Backend/API + Frontend Integrasi | Tidak ada N+1 kritis; resident tanpa lease aktif tetap kompatibel; public regression lulus. |
| M8 — Hardening & canary | Contract/RBAC/PII/concurrency/E2E, backup-restore rehearsal, evidence release, canary flag read lalu write/transfer/scheduler per property. | M1–M7 yang relevan | QA/Release + Integrator | Empat gate QA non-negotiable lulus; error/audit/queue terpantau; canary stabil. |
| M9 — Demo seed terjaga | Fixture/reset demo realistis dan guard anti-production, termasuk data lease/invoice/ledger sintetis. | M5 | Backend/DB + QA | Dijalankan hanya disposable/demo; bukan dependency deployment production. |

### 4.1 Pekerjaan paralel yang aman

1. M0 harus selesai terlebih dahulu.
2. Sesudah M0, M1, M2, dan M3 dapat berjalan paralel.
3. Sesudah M2, M4 dapat berjalan paralel dengan M5.
4. Sesudah M5, UI lease inti dapat berjalan paralel dengan backend transfer/scheduler;
   panel transfer baru diintegrasikan setelah endpoint dan test transaksi stabil.
5. M7 dapat dipisah per domain setelah read model lease stabil. M9 tidak boleh
   memakai database yang sama dengan migration atau QA release.

## 5. File ownership dan aturan hand-off

Ownership berarti hanya owner tersebut yang mengubah file selama stream paralel.
Agent lain mengirim kontrak, fixture, atau review; mereka tidak mengedit file
milik owner tanpa koordinasi eksplisit.

| Area | File/direktori yang dimiliki | Owner | Hand-off |
|---|---|---|---|
| Kontrak/release integrasi | docs/hotfixes/REVISI_UX_ADMIN.md, docs/plans/ADMIN_UX_*, root package.json, CI/runbook/registry flag | Integrator/Release | Perubahan kontrak harus direview Backend, Frontend, dan QA. |
| Migration/master data | backend/api/src/infrastructure/database/migrations/016_*, scripts preflight/validator, modul kost type/facility/rule/room/gallery terkait | Backend Master + Backend/DB | Tidak ada backfill heuristik. Migration 017 menunggu 016 selesai dan diverifikasi. |
| Lease lifecycle | migration 017_*, backend/api/src/modules/lease/ baru, integrasi occupancy/billing/payment/resident/file/notification | Backend Lifecycle | Satu owner lifecycle mengintegrasikan status room, invoice, dan ledger pada akhir stream. |
| Hotspot Backend | backend/api/src/app.module.ts, backend/api/package.json, RBAC seed, shared guard/serializer, core-seed.data.ts | Backend Lead tunggal | Tidak boleh diedit paralel oleh owner master/lifecycle. Tambahan billing.manage untuk admin memerlukan amendment kontrak. |
| Route/data foundation | apps/admin/src/lib/**, registry route/nav/feature, layout/access boundary, mapper API, query-key factory | Frontend Foundation | routeTree.gen.ts hanya hasil generator dan tidak diedit manual. |
| UI master data | apps/admin/src/routes/rooms/**, room/gallery/form/state components dan hooks | Frontend Master | Bergantung pada fixture/API M2; tidak mengubah semantics server. |
| UI lease/integrasi | apps/admin/src/routes/penyewaan/**, komponen/hook lease, lalu tenants/payments/vehicles/parking/notifications/dashboard | Frontend Lease/Integrasi | Menunggu M5 untuk lifecycle; tidak memakai optimistic mutation lifecycle. |
| QA evidence | Contract suite black-box, browser E2E, disposable fixture, verifier/smoke script, report sanitization | QA/Release | QA tidak mengubah source produk. Perubahan manifest/script disalurkan ke owner Backend, Frontend, atau Integrator. |

### 5.1 Batas file yang tidak boleh dilanggar

- Frontend tidak mengubah migration, endpoint API, seed, atau permission server.
- Backend tidak mengedit route generated atau komponen UI kecuali kontrak sudah
  disetujui bersama.
- QA tidak memperbaiki source domain ketika menemukan defect; QA memberi bukti
  reproduksi, owner area memperbaikinya.
- Integrator satu-satunya pemilik amendment kontrak saat stream implementasi aktif.
- Perubahan pada app.module.ts, package manifest shared, RBAC seed, migration
  runner, core seed, registry nav/feature, mapper API, atau query-key factory harus
  dikunci dalam work item tersendiri sebelum agent lain bergantung padanya.

## 6. Gate persetujuan sebelum kode dimulai

Persetujuan dianggap lengkap bila pemilik produk menerima seluruh keputusan
berikut:

- V1 tidak menerima lease atau transfer bertanggal masa depan.
- Semantik transfer half-open dan invoice target tanpa proration diterima.
- Refund boleh pending dan memiliki settlement/waive terpisah.
- Admin tidak mendapat billing.manage.
- Area bersama memakai allowlist key, bukan tabel baru.
- Migration fail-closed bila data legacy ambigu.
- Urutan flag per property dan empat gate QA non-negotiable diterima.

Setelah persetujuan eksplisit, pekerjaan pertama adalah **M0 preflight**, bukan
langsung membuat migration atau UI. Temuan M0 yang mengubah keputusan di atas
wajib menjadi amendment kontrak sebelum M2 dimulai.
