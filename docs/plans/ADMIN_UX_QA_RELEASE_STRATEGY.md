# UX Admin — QA & Release Strategy

> **Status:** Rencana QA/release; tidak mengimplementasikan aplikasi.  
> **Dasar kontrak:** `docs/hotfixes/REVISI_UX_ADMIN.md` (Fase 0 bersifat normatif).  
> **Cakupan:** Admin UX, API/database pendukung, kompatibilitas API lama/publik, dan rilis Fase 0–9.

---

## Ringkasan keputusan

Revisi ini tidak aman dirilis sebagai satu perubahan UI. Ia mengubah sumber kebenaran harga/fasilitas, menambahkan lifecycle lease yang transaksional, scheduler penagihan, ledger deposit, dan hubungan baru antara occupancy, invoice, serta transfer kamar. Karena itu, rilis harus memakai urutan **expand database → adapter/backend kompatibel → UI tersembunyi → enable bertahap per properti**, bukan database rollback atau enable menu sekaligus.

Empat gate yang tidak boleh dinegosiasikan adalah:

1. Migration 016/017 terbukti reentrant pada PostgreSQL disposable, backfill tervalidasi, dan clone hasil restore lulus invariant data.
2. Lifecycle lease, billing, deposit, dan transfer lulus test transaksi/konkurensi; scheduler tidak boleh aktif sebelum gate ini lulus.
3. RBAC, property scope, audit sanitization, dan akses file KTP lulus role matrix dengan minimal dua properti.
4. Endpoint admin lama dan endpoint publik lama lulus contract regression sebelum dan sesudah migration. Halaman publik tidak ikut berubah pada rilis ini.

Tidak ada reset demo, validator yang melakukan mutasi, atau test create/transfer/checkout yang boleh dijalankan terhadap production. Smoke production hanya read-only dan memakai akun least-privilege yang disetujui.

## Baseline yang ditelaah

Telaah dilakukan secara statis terhadap dokumen revisi, paket root/API/admin, runner database, seluruh seed script, dan seluruh validation script yang tersedia saat laporan ini dibuat.

| Area | Kondisi saat ini | Implikasi strategi |
|---|---|---|
| Root `package.json` | Ada wrapper dev/build/lint dan `db:migrate:api`/seed API; belum ada test atau aggregate release gate. | Tambahkan gate root yang hanya merangkai command terverifikasi; jangan menganggap build sebagai bukti workflow. |
| `backend/api/package.json` | Ada `lint`, `build`, `db:migrate`, `db:seed`, `db:seed:dev`, serta validator billing/complaint/vehicle/notification/room inventory/Smart Lock. Tidak ada `test`, Jest config, atau test integration script. | `@nestjs/testing` sudah ada, tetapi runner test dan database disposable belum ada. Workflow lease perlu suite sendiri. |
| `apps/admin/package.json` | Ada `lint`, `typecheck`, dan `build`, tetapi tidak ada Vitest, React Testing Library, browser E2E, atau script `test`. | Komponen dan flow admin belum memiliki automated regression gate. |
| CI/test configuration | Tidak ditemukan konfigurasi Jest, Vitest, Playwright, test spec, maupun workflow CI repository-managed. Artifact QA lama ada, tetapi bukan command release yang reproducible. | Bukti artifact dapat dipakai sebagai referensi, bukan sebagai pengganti pipeline. |
| Migration runner `backend/api/src/infrastructure/database/scripts/migrate.ts` | Mengurutkan semua `*.sql` lalu menjalankan **semuanya pada setiap invocation**. Tidak ada tabel `schema_migrations`, advisory lock, atau transaction per migration di runner. | Migration harus benar-benar idempoten/reentrant; deployment hanya boleh menjalankan satu migration job. Verification wajib menjalankan runner dua kali pada database disposable. |
| Seed core `seed-core.ts` | Transactional dan banyak upsert/validation; dev data hanya diaktifkan oleh `--with-dev-data` untuk environment development. Fixture sekarang masih memakai `room_types`, occupancy, dan invoice legacy; belum mencakup kost type/lease/ledger baru. | Jangan gunakan `db:seed:dev` sebagai reset realistis maupun sebagai bukti Fase 9. Fixture baru dan guard terpisah diperlukan. |
| RBAC seed | `seed-rbac.ts` dan `001_rbac_seed.sql` ada tetapi tidak diekspos oleh script package. Seed saat ini memiliki `lease.manage`, tetapi kontrak revisi membutuhkan `lease.read` dan matrix akses yang lebih ketat. | Tambahkan test seed/RBAC untuk permission final; jangan menyimpulkan permission dari nama role/UI. |
| Validator yang ada | Billing melakukan SQL fixture; complaint, vehicle, dan notification menjalankan HTTP mutation; Smart Lock memeriksa DB/Redis; room inventory dry-run default namun mode apply menulis data dengan guard. Beberapa validator tidak memiliki production/database-target guard kuat dan sebagian meninggalkan data/sesi. | Semua validator lama hanya untuk disposable/development/staging khusus. Mereka tidak menggantikan test lease dan tidak boleh menjadi smoke production. |

### Catatan baseline penting

- Migration 016 dan 017 yang diwajibkan oleh dokumen revisi belum ada pada daftar migration saat telaah ini dibuat. Rencana di bawah adalah gate untuk saat keduanya diimplementasikan.
- `db:seed:dev` saat ini membuat occupancy aktif dan invoice legacy. Ia tidak dapat membuktikan invariant one-to-one lease–occupancy, unique invoice cycle lease, atau ledger deposit.
- Validator room inventory sudah memberi pola yang baik untuk dry-run, konfirmasi eksplisit, backup confirmation, PII scan, dan laporan. Namun target properti masih diinferensi, bukan guard reset demo final, dan cakupannya hanya room inventory.
- Artifact `artifacts/m14b-api-regression-smoke/` menyatakan cross-property belum diuji karena hanya satu properti fixture. Fixture QA revisi harus menyediakan minimal dua properti agar denial lintas properti dapat dibuktikan.

## Lingkungan, data uji, dan bukti

| Lingkungan | Data dan aksi yang diizinkan | Bukti minimum |
|---|---|---|
| Local/disposable PostgreSQL | Migration, seed, lifecycle mutation, concurrency, scheduler trigger, reset demo. Database dibuat khusus per run. | Log command, hasil assertion, laporan schema/invariant, dan cleanup terverifikasi. |
| CI integration | PostgreSQL disposable dengan versi/extension setara target; service Redis bila suite Smart Lock/notification memerlukannya. Tidak memakai database bersama. | JUnit/JSON result, coverage/contract result, artifact migration kedua. |
| Staging khusus demo | Seed reset realistis yang guarded; browser E2E; rehearsal backup/restore; feature flag canary. Tidak ada hardware Smart Lock nyata. | Report reset, manifest fixture, screenshot/E2E trace, backup/restore drill result. |
| Production clone terisolasi | Restore backup terenkripsi, migration rehearsal, verifier read-only, API contract comparison. | RPO/RTO measured, checksum/count comparison, sign-off DBA/owner data. |
| Production | Migration job tunggal, smoke read-only, monitoring, enable flag bertahap. Tidak ada reset seed atau lifecycle test sintetis. | Deployment record, migration log, smoke result tersanitasi, dashboard monitoring, approval gate. |

Fixture minimum untuk suite otomatis adalah dua properti, masing-masing memiliki owner/manager/admin/property_owner/technician, penghuni aktif, kamar di setiap status relevan, dan file KTP sintetis. Satu properti harus menjadi target, satu lagi harus menjadi sumber foreign key yang sengaja salah. Semua NIK/telepon/file adalah sintetis; token, URL storage, dan data identitas tidak boleh disimpan sebagai artifact CI.

## Test matrix

Label **Otomatis wajib** berarti blocking release gate. Label **Manual wajib** berarti perlu evidence manusia karena bergantung pada UX, operasi, atau karakteristik production yang tidak cukup dibuktikan unit test.

| Domain | Cakupan dan assertion utama | Otomatis wajib | Manual wajib |
|---|---|---|---|
| Database, migration, dan backfill | Jalankan baseline → 016 → 017 pada DB bersih, lalu runner yang sama sekali lagi. Verifikasi table/column/FK/check/index termasuk partial unique; data lama tetap terbaca; tidak ada `TRUNCATE`; kamar aktif mempunyai `kost_type_id`; category/property room–building–kost type konsisten; snapshot harga legacy sinkron; invoice legacy tetap valid dengan `lease_id` null. Verifikasi invariant lease/occupancy, invoice cycle, ledger deposit, dan audit sanitized. | Ya: `db:migrate:verify` dan `db:validate:admin-ux` pada DB disposable serta restored clone. | Ya: review query plan/lock duration, volume backfill, error log, dan keputusan data ambigu pada clone production. |
| Backend API dan contract | DTO validation, snake_case, pagination `{ data, meta }`, limit default/maksimum, filtering, status 403/409/422, idempotency replay, route statis sebelum `:id`, audit postcondition, legacy adapter room/invoice/check-in/out. Pastikan list/detail tidak N+1 dan dashboard memakai snapshot konsisten. | Ya: unit service + Nest integration/API contract tests. | Hanya review API compatibility diff dan observability payload tersanitasi pada staging. |
| Frontend admin | Sidebar group/collapse/active parent, route conflict/redirect, feature flag/RBAC navigation, breadcrumb aman, URL filter/pagination/reset, CurrencyInput, searchable select, DnD reorder rollback, loading/empty/error/forbidden, form lease stepper/retry, responsive 375/768/1024, keyboard/focus/screen reader. | Ya untuk component/route guard/form kritis dan browser E2E jalur utama. | Ya untuk visual hierarchy, keterbacaan, mobile ergonomics, dan exploratory usability. |
| RBAC, property scope, PII, file, dan audit | Matrix owner/manager/admin/property_owner/technician/resident × dua properti. Pastikan `lease.read` hanya sesuai kontrak; property_owner read-only tanpa lease/PII; technician tidak bisa lease/KTP; foreign key lintas properti ditolak 422; KTP masked di list/detail sesuai izin; file URL authorization/expiry; storage path, NIK, dan KTP tidak muncul di list, notification, request log, atau audit before/after. | Ya: API integration, response-schema/leak scan, audit DB assertions, file authorization test. | Ya: review artifact/log/trace tersanitasi dan sesi browser dengan akun berbeda. |
| Scheduler dan billing | Trigger scheduler dengan clock yang dapat diinjeksi: 00:10 Asia/Jakarta, monthly/yearly, anchor 29–31, Feb 29/non-kabisat, due date bound, catch-up ≤12 serta alert, retry setelah insert invoice, dua instance/job paralel. Assert satu invoice issued per `(lease_id, cycle_start_date)`, `next_billing_date` maju tepat sekali, notification dilakukan setelah commit. | Ya: integration test transaksi dengan PostgreSQL, dual-worker/concurrency test, deterministic clock. | Ya: verifikasi schedule timezone dan alert/monitoring pada staging sebelum flag scheduler aktif. |
| Lease, occupancy, room state, dan transfer | Create lease paralel untuk room/resident sama; resident baru opsional; idempotency key sama; lock/rollback; first invoice issued; status kamar hanya berubah melalui lease. Close menghentikan invoice baru tanpa menghapus piutang. Transfer paralel ke target sama, mid-cycle tanpa proration, anchor tetap, old debt tetap, old/new occupancy+lease/history+record atomik. | Ya: `lease:validate-workflow`, transaction rollback/fault injection, API integration concurrency. | Ya: review ringkasan dampak transfer/checkout dan rekonsiliasi riwayat kamar dengan user bisnis. |
| Deposit, payment, invoice, dan dashboard finansial | Collection/top-up/carry-forward/deduction/refund hanya nominal non-negatif; ringkasan lease = sum ledger; refund bukan payment negatif; deduction tunggakan tidak melunasi invoice; payment allocation/invoice legacy tetap valid; verified revenue saja di dashboard. Uji checkout refund penuh, deduction kerusakan, utang melebihi deposit, dan transfer ke deposit berbeda. | Ya: database invariant + workflow integration + reconciliation query. | Ya: finance/business owner memeriksa contoh settlement dan laporan sebelum flag write dibuka luas. |
| Regresi public API dan modul lama | Snapshot/JSON-schema response public sebelum/ sesudah migration untuk `/public/rooms/summary`, `/public/rooms/availability`, `/public/rooms/groups/:groupKey`, `/public/hunian-catalog`, detail catalog, content gallery yang valid, serta public booking lead bila fixture aman. Tambahkan room/invoice legacy, occupancy/check-in/out, resident/payment/vehicle/parking/notification regression yang masih dipakai admin/penghuni. Tidak ada PII/storage path di respons publik. | Ya: contract regression di fixture tetap, API smoke staging, non-breaking schema comparison. | Ya: cek halaman publik `/kamar` pada browser dan redirect admin lama tanpa mengubah konten publik. |
| Integrasi operasional yang tidak berubah | Smart Lock/CCTV/Access History tetap feature-gated; vehicle room diturunkan dari lease aktif; notification dedupe/count; booking lead tidak membuat lease atau mengubah status kamar. | Ya: regression validator relevan ditambah assertion lease-aware. | Ya: konfirmasi tidak ada hardware nyata atau command live yang tersentuh pada demo/reset. |

## Pembagian test otomatis dan manual

### Gate otomatis yang wajib lulus

1. API: lint, build, unit test, Nest integration/API contract, database disposable migration dua kali, seed fixture, validator lease, RBAC/PII leak scan, public contract regression.
2. Admin: lint, typecheck, build, component test, accessibility assertion, dan browser E2E untuk navigasi, master data, create lease, transfer, checkout, pembayaran, serta denial role utama.
3. Database: query invariant sebelum/ sesudah migration, restore-clone verification, migration lock/re-run test, dan no-public-contract-regression test.
4. Release candidate: smoke staging read-only + stateful lifecycle hanya pada fixture terisolasi; production smoke hanya read-only.

Automasi harus gagal tertutup: status test non-zero, schema mismatch, response PII leak, duplicate invoice/lease, atau data invariant violation memblokir promotion. Lint/build hijau sendiri tidak cukup.

### Verifikasi manual yang tetap wajib

1. Sign-off kontrak Fase 0: nama tabel/endpoint, source of truth, error semantics, dan policy retensi/PII.
2. Review hasil backfill clone: record ambigu, jumlah room/kost type, perbedaan harga legacy, dan durasi/lock migration dengan volume production.
3. Browser UX: sidebar/mobile, visual state, copy/error actionability, focus order, keyboard dialog, dan screen reader smoke pada tiga breakpoint.
4. Finance/operations: sample checkout/transfer, perhitungan refund/deduction, invoice lama, dan dashboard reconciliation.
5. Backup/restore drill, readiness monitoring, ownership flag, dan incident decision tree.
6. Production canary: observasi metrics/error/latency sebelum menaikkan feature flag ke properti lain.

## Tooling dan script yang belum ada

Nama di bawah adalah target command yang disarankan, bukan implementasi dalam laporan ini. Semua script mutatif harus menerima `DATABASE_URL` eksplisit dan menolak target yang bukan disposable/staging yang diizinkan.

| Kebutuhan | Command/script minimum | Alasan dan acceptance |
|---|---|---|
| Test backend yang runnable | `npm --workspace @granada-kost/api run test`, `test:unit`, `test:integration` | Tambahkan Jest/runner Nest yang benar, setup/teardown DB disposable, dan hasil machine-readable. `@nestjs/testing` sudah ada tetapi belum ada runner `test`. |
| Workflow lifecycle | `lease:validate-workflow` | Wajib menguji create/idempotency/race, scheduler calendar/retry, checkout, transfer, deposit, RBAC/PII, dan legacy/public compatibility seperti Verification Plan. Fixture harus dibersihkan atau DB dibuang setelah run. |
| Verifier migration reentrant | `db:migrate:verify` | Provision DB bersih, jalankan migration dua kali, simpan schema fingerprint/invariant result, dan fail jika second run mengubah data bisnis selain metadata yang disetujui. Jangan membuat command rollback. |
| Verifier data Fase 0–4 | `db:validate:admin-ux` | Query invariant property scope, kost type, room snapshot, lease/occupancy, invoice cycle, deposit ledger, audit sanitization, dan public compatibility fixture. Read-only terhadap target yang sudah dimigrasi. |
| Scheduler harness | `test:scheduler` atau bagian integration suite | Injeksi clock Asia/Jakarta dan jalankan service secara sinkron; simulasi dua worker serta failure setelah invoice insert. Tidak mengandalkan menunggu cron nyata. |
| Contract/API regression | `test:contract:legacy`, `test:contract:public` | JSON schema/selected-field contract untuk endpoint lama dan publik. Baseline response dari fixture tersanitasi; test membedakan list baru ber-envelope dari endpoint lama yang mempertahankan bentuk responsnya. |
| Smoke API repeatable | `api:smoke:admin-ux` | Runner shell/Node dengan HTTP status, content type, JSON schema, correlation ID, pagination, property scope, dan leak scan. Parameterized `API_BASE_URL`; tidak hard-code `localhost:3001`. |
| Test frontend | `npm --workspace @granada-kost/admin run test` | Tambahkan Vitest + React Testing Library untuk CurrencyInput, searchable select, breadcrumb, route guard, state error, serta lease form. Saat ini paket admin hanya lint/typecheck/build. |
| Browser E2E | `npm --workspace @granada-kost/admin run test:e2e` | Tambahkan Playwright atau runner setara, trace/screenshot tersanitasi, viewport 375/768/1024, role matrix, dan network assertions. Artifact browser lama bukan gate yang package-managed. |
| Reset demo terjaga | `db:seed:demo:reset` / `reset-and-seed-realistic.ts` | Implementasi Fase 9 yang terpisah dari `db:migrate` dan `db:seed:dev`; dry-run, confirmation, target property allowlist, report JSON, validation pascaseed, serta cleanup orphan file. |
| Backup/restore rehearsal | `db:backup:verify` dan `db:restore:verify` atau job release setara | Menjalankan `pg_dump`/`pg_restore` pada clone, mengukur RPO/RTO, memverifikasi schema/data/app smoke, dan menyimpan artifact tanpa PII. |
| Root release gate | `verify:admin-ux` | Merangkai lint/build/test API/admin, migration verifier, seed/lease validator, contract test, dan smoke staging. Root saat ini tidak memiliki aggregate test gate. |

### Perlakuan terhadap validator yang sudah ada

Validator billing, complaint, vehicle, notification, room inventory, dan Smart Lock tetap bernilai sebagai regresi domain lama, tetapi bukan pengganti suite baru. Khususnya:

- `billing:validate-workflow` mengubah fixture lewat SQL dan hanya memiliki guard environment dasar.
- `complaint:validate-workflow`, `vehicle:validate-workflow`, dan `notification:validate-workflow` membuat/mengubah data melalui API; jangan jalankan di production atau database staging bersama.
- `room-inventory:validate` aman sebagai dry-run secara default; `room-inventory:apply` sudah meminta `--apply`, confirmation, dan backup confirmation, tetapi tetap hanya boleh dipakai pada runbook inventori yang disetujui.
- `smartlock:validate-runtime` bergantung pada Redis/dev gateway dan memeriksa safety runtime; keep it isolated from live hardware and real credentials.

## Verifikasi migration forward-only

### Aturan operasi

1. Tidak ada command rollback/down migration dalam release plan. Jika migration gagal sebelum code baru diaktifkan, hentikan deployment dan perbaiki dengan forward migration setelah diagnosis.
2. Karena runner saat ini menjalankan semua SQL setiap kali tanpa migration ledger, 016/017 dan migration berikutnya harus aman dijalankan ulang. Ini diuji **hanya** pada database disposable/clone, bukan dengan menjalankan migration production dua kali sebagai ritual.
3. Production menjalankan satu migration job/replica saja. Tambahkan serialisasi operasional (misalnya advisory lock PostgreSQL atau job deployment tunggal) sebelum rollout aplikasi; dua pod tidak boleh menjalankan runner bersamaan.
4. Semua migration additive: tambah table/column/index/constraint/backfill terkendali; tidak ada `TRUNCATE`, drop kolom legacy, atau reset demo. Perubahan yang berpotensi lock panjang harus diuji pada clone berukuran representatif.

### Prosedur verification pada database disposable

1. Buat PostgreSQL baru dengan major version, extension, collation, timezone, dan parameter penting yang setara target. Terapkan migration baseline dan fixture legacy yang representatif.
2. Jalankan `db:migrate`; simpan daftar object schema, constraint/index definition, jumlah per entitas, dan checksum business-field yang mengecualikan `updated_at`/audit timestamp.
3. Jalankan `db:migrate` kedua kali pada database yang sama. Bandingkan schema fingerprint dan business checksum. Tidak boleh ada duplicate kost type, assignment, invoice, history, ledger, atau mutation harga tak terduga.
4. Jalankan `db:validate:admin-ux` dengan minimal data berikut: room aktif/inaktif, dua property, legacy invoice, legacy occupancy, room masing-masing kategori, room dengan data valid dan data yang sengaja ditolak.
5. Jalankan API legacy/public contract suite terhadap database hasil migration. Endpoint lama yang masih tersedia harus tetap menghasilkan status dan field yang dijanjikan adapter.
6. Ulangi langkah 1–5 terhadap database hasil `pg_restore` dari clone production. Ini adalah rehearsal yang bermakna, bukan sekadar schema kosong.

### Query/invariant yang harus menjadi blocker

- Kamar aktif tanpa `kost_type_id`, atau room/building/kost type berbeda property/category.
- Lebih dari satu lease/occupancy aktif untuk room atau resident yang sama, atau lease tanpa occupancy unik yang cocok.
- Invoice lease tanpa cycle valid, duplicate `(lease_id, cycle_start_date)`, atau invoice legacy dipaksa memiliki `lease_id`.
- Total ledger deposit tidak sama dengan kolom ringkasan lease, nominal negatif, atau refund direkam sebagai payment negatif.
- Harga/fasilitas baru ditulis ke assignment legacy sebagai source of truth, atau snapshot harga room tidak sinkron setelah PATCH kost type.
- Audit/notification metadata mengandung nomor KTP, URL/storage path KTP, atau PII yang dilarang.

### Jika terjadi kegagalan production

1. Stop promotion, matikan flag write/scheduler bila code telah terpasang, dan simpan correlation ID/log migration.
2. Tentukan apakah database konsisten dan dapat diperbaiki dengan migration forward kecil. Ini adalah jalur normal untuk schema additive.
3. Restore backup hanya untuk insiden integritas yang tidak bisa diperbaiki forward dan setelah owner aplikasi/DB menyetujui pasangan versi aplikasi–database yang akan dipulihkan. Jangan restore otomatis sementara pod versi baru masih aktif.
4. Setelah recovery, ulangi verifier clone dan public/legacy smoke sebelum membuka flag kembali.

## Backup/restore drill

Backup tidak dianggap tervalidasi hanya karena file dump berhasil dibuat. Drill wajib dilakukan sebelum production release pertama yang memuat 016/017.

| Tahap | Aktivitas | Exit evidence |
|---|---|---|
| Persiapan | Tetapkan owner, RPO/RTO target, PostgreSQL version, encryption/access control, ruang restore, dan daftar data yang tidak boleh muncul di artifact. Ambil logical backup pre-migration dan catat ukuran/checksum/timestamp. | Backup dapat dibaca, metadata tercatat, akses dibatasi. |
| Restore | Restore ke instance kosong terisolasi menggunakan prosedur yang sama yang akan dipakai saat insiden. Pastikan extension/role/schema tersedia. | `pg_restore` sukses; jumlah/checksum tabel kritis serta sample file metadata cocok dengan backup. |
| Rehearsal migration | Jalankan migration forward pada hasil restore, ukur waktu/lock/error, lalu jalankan verifier DB dan API contract suite. | Semua invariant lulus; durasi berada dalam budget rilis; tidak ada data PII dalam report. |
| App verification | Jalankan backend release candidate terhadap restore clone dan lakukan smoke authenticated/public read-only. | Health, legacy/public response, RBAC denial, dan dashboard summary sesuai fixture. |
| Recovery rehearsal | Simulasikan rollback operasional ke backup di environment terisolasi dan catat langkah, durasi, dependensi, serta decision owner. | RTO terukur; runbook jelas kapan restore dipilih dibanding forward-fix. |

Tidak ada backup/restore command dijalankan oleh tugas ini; drill adalah prerequisite release yang harus menghasilkan evidence tersanitasi.

## Seed demo guard

`db:seed:dev` yang ada adalah core/dev seed idempoten, bukan reset data realistis. Fase 9 memerlukan jalur berbeda dengan aturan berikut.

### Guard sebelum koneksi destruktif

`reset-and-seed-realistic.ts` harus berhenti sebelum operasi write/destructive apabila salah satu kondisi berikut tidak terpenuhi:

1. `NODE_ENV` bukan `production` dan environment berada pada allowlist development/staging demo khusus.
2. `DATA_RESET_CONFIRM=RESET_REALISTIC_DEMO_DATA` tepat, dan `DATA_RESET_BACKUP_CONFIRMED=true` tepat.
3. Target property dipilih eksplisit; database name/URL/property juga cocok dengan allowlist demo. Jangan mengandalkan inferensi satu properti atau jumlah room.
4. Inventory preflight tidak menemukan Smart Lock, files, atau konfigurasi non-demo. Metadata demo harus eksplisit; ketiadaan metadata berarti **tolak**.
5. Script menampilkan dry-run property, tabel/record/file terdampak, dan menyimpan manifest/report sebelum confirmation final.

### Perilaku aman dan test guard

- Script tidak dipanggil oleh `db:migrate`, start aplikasi, atau seed production.
- Reset bersifat transaction-aware untuk data database; pembersihan storage memakai manifest/kompensasi agar file orphan dapat dideteksi dan dibersihkan secara terkendali.
- Users, user_roles, properties, property_settings, serta konfigurasi non-demo hanya dipertahankan bila policy eksplisit mengizinkannya; tidak ada asumsi implisit.
- Test negatif wajib: production, confirmation salah/hilang, backup confirmation hilang, property kosong/salah, non-demo Smart Lock, non-demo file, non-demo config, dan database URL di luar allowlist. Semua harus berhenti tanpa perubahan count/checksum.
- Test positif hanya di database disposable: fixture Fase 9 lengkap, validator post-seed lulus, tidak ada orphan file, tidak ada hardware nyata terhapus, dan endpoint admin serta public legacy tetap dapat dibaca.

Fixture demo akhir harus mencakup dua kost type aktif, fasilitas/aturan/galeri, 163 room/26 unit, lease aktif/historis, occupancy, invoice/payment allocation, deposit ledger, kendaraan/parkir, dan history yang konsisten sesuai dokumen revisi. Ia tidak boleh memakai identitas atau dokumen nyata.

## API smoke test yang benar

Contoh `curl | jq '.data | length'` pada dokumen revisi berguna sebagai ilustrasi, tetapi belum cukup menjadi release smoke: ia tidak selalu memeriksa status HTTP, content type, error envelope, pagination, scope property, atau PII. Selain itu, konfigurasi API saat ini default ke port 3000; gunakan `API_BASE_URL`, bukan hard-code port 3001.

### Prinsip runner

1. `API_BASE_URL`, `API_PREFIX`, token, dan property fixture diberikan via secret environment. Token tidak ditulis ke log/artifact.
2. Gunakan `curl --fail-with-body` atau HTTP client setara, timeout pendek, retry terbatas hanya untuk readiness, dan simpan body tersanitasi untuk failure.
3. Set `X-Correlation-Id` unik; jika error, assert error envelope global (`success: false`, code yang relevan, correlation ID) tanpa mengekspos request detail sensitif.
4. Assert HTTP status, `Content-Type`, JSON valid, required field/type, serta absence field terlarang. Untuk list baru, assert `data` array dan `meta.total/limit/offset`; untuk endpoint legacy/public, assert bentuk kontrak yang telah dibaseline, bukan memaksa envelope baru.
5. Production smoke read-only. POST lease, deposit, close, transfer, file upload, atau public booking lead yang membuat data hanya berjalan pada staging fixture/integration suite.

### Urutan smoke staging/release candidate

| Test | Actor | Assertion |
|---|---|---|
| `GET /api/v1/health` | Tanpa token | 200 dan dependency health sesuai policy deployment. |
| `GET /api/v1/kost-types?property_id=…&limit=20&offset=0` | Admin/manager target property | 200; `{data,meta}` valid; semua data milik property target; tidak ada field internal/PII. |
| `GET /api/v1/leases?property_id=…&limit=20&offset=0` | Admin/manager | 200; envelope/pagination valid; lease summary sanitized; no duplicate active fixture. |
| `GET /api/v1/leases/overdue?property_id=…` | Admin/manager | 200; route statis benar-benar tidak tertangkap `:id`; envelope valid. Tidak pernah menguji `/leases/expiring` karena endpoint itu tidak ada dalam model open-ended. |
| `GET /api/v1/dashboard/summary?property_id=…` | Admin/manager | 200; `active_leases`/metric wajib bertipe benar, timezone Jakarta, dan nilai direkonsiliasi terhadap query fixture. |
| Denial RBAC/property | Tanpa token, property_owner, technician, dan actor property kedua | 401/403/422 sesuai kontrak; tidak ada body lease/KTP yang bocor. |
| Legacy admin | Admin/manager | `GET /rooms`, room detail, `GET /invoices`, serta endpoint occupancy/check-in/out yang masih dipertahankan memenuhi contract adapter dan tidak mengubah data. |
| Public contract | Tanpa token | `GET /public/rooms/summary`, `GET /public/rooms/availability`, `GET /public/hunian-catalog`, dan detail dari slug fixture. Assert 200, bentuk respons lama, no PII/storage path, dan baseline availability/price sesuai fixture. Test gallery content memakai image ID fixture yang public-valid dan memeriksa content type/security header. |

Untuk production, jalankan subset read-only: health, public summary/catalog, endpoint admin read yang disetujui, dan RBAC denial non-mutatif. Detail catalog/group hanya diuji bila ada fixture/listing stabil; jumlah item tidak boleh di-hard-code karena availability dapat berubah, tetapi schema dan invariant privacy harus tetap sama.

## Definition of Done per fase

| Fase | Definition of Done QA/release |
|---|---|
| 0 — Kontrak arsitektur & data | Kontrak table/endpoint/error disetujui; fixture dua properti/role tersedia; test case duplicate request, race lease, transfer, checkout overdue, dan scheduler failure tertulis; decision seluruh route lama jelas; threat model PII/file/audit disetujui. |
| 1 — Sidebar & routing | Tidak ada route collision; redirect/retensi route lama teruji; menu desktop/mobile dan direct URL tunduk pada RBAC+flag; breadcrumb label aman; E2E/a11y/manual breakpoint evidence lulus. UI belum di-enable jika API target belum tersedia. |
| 2 — Master data & adapter | Migration 016 lulus disposable run dua kali; backfill/invariant zero-violation; kost type mutation sinkron snapshot legacy atomik; room/public/legacy contract regression lulus; gallery target tidak memalsukan common area. |
| 3 — Komponen UX | Unit/accessibility test CurrencyInput, select, dan breadcrumb lulus; rupiah integer/no overflow; DnD atomic rollback; keyboard/focus state lulus; bundle build/typecheck bersih. |
| 4 — Lease, billing, deposit | Migration 017 plus create/close/deposit lifecycle lulus transaction/concurrency suite; first invoice issued; idempotency; scheduler calendar/retry; PII/audit/property scope; notification post-commit; `lease:validate-workflow` dan API contract gate hijau. Scheduler production masih off sampai canary. |
| 5 — Transfer | Race target-room, atomic rollback, anchor/invoice lama/deposit carry-forward, two histories/transfer record, room status, PII timeline, dan business reconciliation lulus. Flag transfer hanya dapat dinaikkan setelah evidence ini. |
| 6 — Dashboard | Summary satu snapshot property-scoped direkonsiliasi terhadap query sumber Asia/Jakarta; empty/error/no-N+1 test; role data minimization; browser metric/action smoke lulus. |
| 7 — Halaman existing | Tenant/payment/vehicle/parking/rules regression lulus dengan lease aktif/historis dan tanpa lease; invoice legacy tetap terbuka; property scope/PII matrix lulus; public API tetap kompatibel. |
| 8 — Notifikasi & polish | Event post-commit/dedupe/unread count teruji; no H-30/expiring behavior; loading/error/forbidden/pending states; responsive/a11y/manual browser evidence lulus. |
| 9 — Seed demo | Reset terpisah memiliki semua negative guard test; fixture realistis dan validator pascaseed lulus; manifest file/orphan/hardware aman; tidak dapat dieksekusi terhadap production/non-demo staging; admin + public legacy smoke after-seed lulus. |

Rilis penuh hanya Done bila seluruh fase relevan hijau, backup/restore drill terselesaikan, release flag owner ditetapkan, dan tidak ada blocker high/critical pada data integrity, PII, public contract, atau duplicate lifecycle.

## Urutan deployment dan feature flag

| Urutan | Deploy/flag | Gate sebelum maju |
|---|---|---|
| 0 | Freeze kontrak, capture public/legacy baseline, backup preflight, restore clone rehearsal. | Fase 0 sign-off dan clone result lulus. |
| 1 | Jalankan migration job tunggal 016/017 dengan semua feature flag admin UX/lease/scheduler **off**. | Migration sukses, DB invariant read-only lulus, tidak ada lock/error di luar budget. |
| 2 | Deploy backend yang memahami schema baru dan masih melayani adapter endpoint lama. Endpoint baru boleh ada tetapi server-side gated. | API legacy/public regression lulus pada release candidate. |
| 3 | Deploy admin baru dengan navigation/route baru tetap off atau internal-only. Redirect lama tetap hidup. | Admin lint/typecheck/build/E2E basic lulus; direct URL tidak bypass backend authorization. |
| 4 | Enable read-only master data/kost type untuk satu property demo/internal (`admin_ux_read`). | API smoke, role/PII matrix, dan snapshot harga/fasilitas verified. |
| 5 | Enable lease create/deposit/close untuk canary property (`lease_write`); scheduler dan transfer tetap off. | Transaction/idempotency/concurrency suite hijau; finance sign-off sample. |
| 6 | Enable transfer canary (`lease_transfer`) setelah history/debt/deposit reconciliation. | Fase 5 Done dan monitoring conflict/error normal. |
| 7 | Enable scheduler (`lease_billing_scheduler`) sebagai flag server-side terpisah, satu leader/job lock, mulai canary dan observasi minimal satu scheduled window. | Calendar/retry/catch-up test, alert route, zero duplicate invoice invariant. |
| 8 | Enable dashboard/existing pages/notification UX, lalu perluas flag property-by-property. | Fase 6–8 Done, public contract tetap hijau. |
| 9 | Jalankan reset realistis hanya pada demo staging khusus; tidak terkait rollout production. | Fase 9 guard evidence lulus. |

Feature flag harus property-scoped, auditable, default-off, memiliki owner/expiry/kill switch, dan diperiksa juga oleh backend untuk mutation; menyembunyikan menu frontend bukan kontrol keamanan. Flag tidak boleh digunakan untuk menyembunyikan PII guard atau untuk "rollback" schema. Safe disable berarti menghentikan write baru/scheduler tanpa menghapus lease, invoice, atau ledger yang sudah tercatat.

## Risiko rilis dan mitigasi

| Risiko | Dampak | Pencegahan/gate | Tindakan bila terdeteksi |
|---|---|---|---|
| Runner menjalankan migration ulang tanpa ledger/lock | Duplicate/partial backfill atau race deployment. | SQL reentrant, `db:migrate:verify` dua kali, migration job tunggal/advisory lock. | Stop rollout; inspect invariant; forward-fix atau restore hanya melalui incident decision. |
| Backfill harga/kost type salah atau data lintas property | Harga/fasilitas salah, public/admin divergence. | Clone rehearsal, checksum business field, zero-violation query, manual ambiguous-data review. | Flag read/write off; forward repair migration/data correction audited. |
| Kontrak public/legacy berubah diam-diam | Halaman publik/penghuni rusak saat admin rilis. | Pre/post JSON schema baseline dan read-only public smoke. | Hold promotion; restore application route compatibility or forward adapter fix. |
| Lease/invoice ganda akibat retry atau multi-instance scheduler | Piutang dan occupancy corrupt. | Unique index, locking, Idempotency-Key, dual-worker and failure-after-insert test. | Disable scheduler/write flag; reconcile with immutable audit/ledger; forward corrective operation. |
| Timezone/anchor/catch-up billing salah | Invoice tanggal/jumlah salah. | Injected-clock calendar suite, Asia/Jakarta assertions, alert at catch-up cap. | Disable scheduler; assess affected cycles; approved corrective invoice workflow. |
| Transfer/checkout tidak atomik | Room status, debt, deposit, history tidak konsisten. | Transaction fault injection, race tests, reconciliation query, business review. | Disable transfer; repair through auditable forward workflow, never manual silent SQL. |
| Deposit tercampur dengan payment invoice | Pendapatan/refund salah dan laporan finance salah. | Ledger invariant and finance scenario suite; dashboard only verified payments. | Stop financial flag; reconcile ledger/invoice separately; corrective audited entries. |
| PII/KTP atau cross-property leak | Insiden keamanan/compliance. | Role matrix dua property, file authorization, response/log/audit leak scan, least-privilege production smoke. | Immediately disable affected endpoint/flag, revoke file URLs/session as applicable, incident response. |
| Seed/reset menyentuh hardware/file/non-demo data | Kehilangan data atau gangguan Smart Lock nyata. | Separate guarded script, metadata deny-by-default, dry-run manifest, demo-only DB. | Never run reset in production; stop immediately and follow restore/incident procedure. |
| UI aktif sebelum API/flag siap | Broken navigation, unauthorized route, misleading state. | API-before-UI ordering, server-side flag, E2E direct-route tests. | Turn off UI flag; keep compatible redirect/menu. |
| Validator lama dipakai di shared/prod DB | Data fixtures/sessions/records tercemar. | Label destructive scripts, disposable DB policy, CI target checks. | Quarantine environment, clean only with approved runbook; do not treat output as production evidence. |

## Release evidence checklist

Sebelum sign-off, release owner mengumpulkan tautan/artifact tersanitasi untuk:

- hasil lint/build/test API dan admin;
- migration run pertama/kedua pada disposable DB, DB invariant report, dan public/legacy contract comparison;
- backup/restore drill dengan RPO/RTO;
- fixture/seed guard negative and positive result;
- scheduler/lease/transfer/deposit workflow result;
- RBAC/PII/file/audit matrix result dengan dua properti;
- browser E2E/a11y/mobile evidence;
- staging smoke dan production read-only smoke;
- daftar feature flag, scope property, owner, enable time, kill switch, dan monitoring dashboard.

Tidak ada evidence yang boleh memuat token, NIK, URL storage KTP, kredensial Smart Lock, atau body respons PII mentah.

---

## Referensi telaah repository

- Kontrak dan verification target: `docs/hotfixes/REVISI_UX_ADMIN.md`.
- Scripts saat ini: `package.json`, `backend/api/package.json`, `apps/admin/package.json`.
- Runner/seed: `backend/api/src/infrastructure/database/scripts/migrate.ts`, `seed-core.ts`, `seed-rbac.ts`, dan `database-url.ts`.
- Validator saat ini: `validate-billing-workflow.ts`, `validate-complaint-workflow.ts`, `validate-vehicle-workflow.ts`, `validate-notification-workflow.ts`, `validate-room-inventory-import.ts`, dan `validate-smartlock-runtime.ts`.
- Baseline migration/seed relevan: `013_room_inventory.sql`, `015_hunian_gallery.sql`, `001_rbac_seed.sql`, dan `core-seed.data.ts`.
