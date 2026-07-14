# Admin UX M7-D1 — Keputusan Dashboard Core Summary Canonical

> **Status:** Amendment dokumentasi normatif M7-D1 untuk kontrak core Dashboard Admin v1; tidak mengizinkan patch kode atau test.
>
> **Authority utama:** `docs/plans/ADMIN_UX_M7_D0_DASHBOARD_SUMMARY_CONTRACT.md`, `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §2 DEC-04, DEC-12, DEC-15, dan DEC-18, serta §4 baris M7.
>
> **Evidence implementasi existing:** repository/service room, lease, resident, invoice, dan payment yang disebutkan pada matriks di bawah. Implementasi legacy `useReports` dan report selectors hanya menjadi evidence kondisi saat ini, bukan authority metric M7-D1.

## 1. Scope dan hierarchy authority

M7-D1 menutup keputusan core untuk endpoint canonical yang telah ditetapkan M7-D0:

`GET /api/v1/dashboard/summary?property_id=<uuid>`

Amendment ini:

1. mengadopsi hanya keputusan yang memiliki evidence domain atau authority kontrak;
2. mengamend registry field M7-D0 khusus bentuk response Dashboard v1 tanpa mengubah file M7-D0;
3. tidak membuat kode, test, endpoint tambahan, migration, seed, permission, feature flag, atau perubahan kontrak domain lain;
4. tidak mengizinkan implementasi sebelum gate implementasi tersendiri disetujui; dan
5. tidak menjadikan client-side aggregation legacy sebagai fallback sumber kebenaran.

Jika terdapat perbedaan, hierarchy authority tetap:

1. `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` untuk keputusan final lintas domain;
2. amendment M7-D1 ini untuk keputusan core Dashboard v1;
3. M7-D0 untuk boundary canonical yang tidak diamend;
4. dokumen desain pendukung dan implementasi existing sebagai evidence terbatas.

## 2. Amendment registry response Dashboard v1

### 2.1 Field yang diadopsi

Response Dashboard v1 hanya mengadopsi field berikut:

- `active_leases`
- `active_residents`
- `rooms_total`
- `rooms_vacant`
- `rooms_occupied`
- `rooms_maintenance`
- `outstanding_amount`
- `overdue_invoice_count`
- `recent_leases`
- `recent_payments`
- `timezone`
- `generated_at`
- `period_start`
- `period_end`

### 2.2 Field yang didefer

| Field                            | Status M7-D1 v1 | Keputusan                                                                                                                                                 |
| -------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verified_revenue_current_month` | **DEFERRED**    | Absen sepenuhnya sampai amendment finance menetapkan definisi revenue, treatment deposit/top-up, allocation, payment unallocated, dan boundary akuntansi. |
| `urgent_maintenance_count`       | **DEFERRED**    | Absen sepenuhnya sampai amendment maintenance menetapkan capability read Dashboard serta status dan priority yang dihitung.                               |

Kedua field deferred tersebut:

- tidak boleh dikirim sebagai `0`;
- tidak boleh dikirim sebagai `null`;
- tidak boleh diganti proxy metric;
- tidak boleh dihitung dari derived value frontend maupun backend; dan
- tidak boleh ditambahkan ke response v1 tanpa amendment finance atau maintenance terpisah yang disetujui.

Keputusan ini secara eksplisit mengamend registry field M7-D0 untuk **response M7-D1 v1**, tetapi tidak menghapus field tersebut dari roadmap atau mengubah isi dokumen M7-D0.

## 3. Matriks formula dan authoritative source

Semua query wajib memakai satu `property_id` yang sudah diotorisasi. Tidak ada aggregate lintas property implicit.

| Field                   | Formula/query source canonical                                                                                                                                                                                                                                                                                          | Evidence source                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `active_leases`         | `count(*)` dari `leases` dengan `property_id = :property_id AND lease_status = 'active'`.                                                                                                                                                                                                                               | Status lease canonical di `backend/api/src/modules/lease/lease.types.ts`; filter/status dan property scope di `backend/api/src/modules/lease/lease.service.ts`.                             |
| `active_residents`      | `count(*)` langsung dari `residents` dengan `property_id = :property_id AND resident_status = 'active'`. Tidak bergantung pada keberadaan lease.                                                                                                                                                                        | `backend/api/src/modules/resident/repositories/resident.repository.ts`; gate M7 mengenai resident tanpa lease aktif di `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §4.                       |
| `rooms_total`           | `count(*)` seluruh inventori fisik `rooms` pada property, termasuk room inactive.                                                                                                                                                                                                                                       | `backend/api/src/modules/room/repositories/room.repository.ts`; enum status di `backend/api/src/modules/room/types/room.types.ts`.                                                          |
| `rooms_vacant`          | Count room pada property dengan `room_status = 'vacant'`.                                                                                                                                                                                                                                                               | Source room yang sama.                                                                                                                                                                      |
| `rooms_occupied`        | Count room pada property dengan `room_status = 'occupied'`.                                                                                                                                                                                                                                                             | Source room yang sama; LeaseService adalah penulis lifecycle occupied/vacant sesuai DEC-14.                                                                                                 |
| `rooms_maintenance`     | Count room pada property dengan `room_status IN ('maintenance', 'requires_review')`. `inactive` dan `reserved` tidak termasuk.                                                                                                                                                                                          | Label normatif “Maintenance/Perlu Review” di `docs/hotfixes/REVISI_UX_ADMIN.md` Fase 6; enum room di `backend/api/src/modules/room/types/room.types.ts`.                                    |
| `outstanding_amount`    | Sum per invoice atas `GREATEST(invoice.total_amount - COALESCE(active_allocations.allocated_amount, 0), 0)` untuk status `issued`, `unpaid`, `partially_paid`, atau `overdue`. Allocation harus dipre-agregasi per invoice dan hanya `allocation_status = 'active'`. Status `draft`, `paid`, dan `void` tidak dihitung. | Formula allocation existing di `backend/api/src/modules/billing/repositories/invoice.repository.ts`; open-status dan outstanding guard di `backend/api/src/modules/lease/lease.service.ts`. |
| `overdue_invoice_count` | Count **invoice**, bukan lease, pada open statuses yang sama, memiliki outstanding positif, dan `due_date < jakarta_today`. Allocation dipre-agregasi per invoice agar satu invoice dihitung paling banyak sekali. Status `'overdue'` saja bukan sumber cukup.                                                          | Query overdue existing di `backend/api/src/modules/lease/lease.service.ts`.                                                                                                                 |

Selector di `apps/admin/src/lib/reports-selectors.ts` dan fan-out di `apps/admin/src/hooks/useReports.ts` tidak menjadi formula canonical. Khususnya, selector legacy yang menjumlahkan `total_amount` tanpa mengurangi active allocation tidak boleh dipakai untuk `outstanding_amount` M7-D1.

## 4. Snapshot dan boundary Asia/Jakarta

Satu response wajib berasal dari satu snapshot database yang konsisten:

1. jalankan satu transaction PostgreSQL `REPEATABLE READ READ ONLY`;
2. tangkap satu anchor waktu dengan `transaction_timestamp()` pada snapshot tersebut;
3. gunakan anchor yang sama untuk `generated_at`, `period_start`, `period_end`, dan `jakarta_today`;
4. hitung boundary kalender dengan timezone `Asia/Jakarta`; dan
5. jangan memanggil jam aplikasi/browser untuk menentukan business date atau boundary response.

Periode menggunakan interval half-open:

`[period_start, period_end)`

Dengan ketentuan:

- `period_start` adalah awal bulan kalender yang memuat anchor waktu di Asia/Jakarta;
- `period_end` adalah awal bulan kalender berikutnya di Asia/Jakarta dan bersifat eksklusif;
- filter timestamp, bila kelak dipakai oleh field yang telah diamend, wajib menggunakan `timestamp >= period_start AND timestamp < period_end`;
- `timezone` selalu string literal `Asia/Jakarta`; dan
- `generated_at`, `period_start`, serta `period_end` diserialisasi sebagai timestamp RFC3339 dengan offset/instant yang tidak ambigu.

M7-D1 tetap membawa metadata periode walaupun metric revenue didefer agar snapshot dapat direkonsiliasi dan kontrak waktu tidak perlu diubah saat amendment finance diterima.

## 5. RBAC dan semantics `property_id`

Endpoint Dashboard core v1 mensyaratkan seluruh boundary berikut:

- role adalah salah satu dari `owner`, `manager`, atau `admin`;
- permission mencakup semuanya: `room.read`, `lease.read`, dan `billing.read`; dan
- `property_id` berada dalam scope actor yang sudah di-resolve server.

`property_id` wajib eksplisit untuk semua actor, termasuk owner dan actor yang hanya memiliki satu property. Endpoint tidak memilih property default dan tidak mengagregasi seluruh property secara implicit.

| Kondisi                                        | HTTP | Error code              | Semantics                                                          |
| ---------------------------------------------- | ---: | ----------------------- | ------------------------------------------------------------------ |
| `property_id` tidak dikirim                    |  400 | `PROPERTY_ID_REQUIRED`  | Request tidak lengkap; server tidak memilih scope secara implicit. |
| Nilai bukan UUID valid                         |  400 | `VALIDATION_ERROR`      | DTO/query validation gagal sebelum query domain.                   |
| UUID valid tetapi property tidak ada           |  404 | `PROPERTY_NOT_FOUND`    | Resource property tidak ditemukan.                                 |
| Property ada tetapi actor tidak memiliki scope |  403 | `PROPERTY_SCOPE_DENIED` | Request terautentikasi tetapi scope ditolak.                       |
| Role atau salah satu permission tidak memenuhi |  403 | `FORBIDDEN`             | Capability Dashboard core tidak terpenuhi.                         |

Response 403 wajib membersihkan data Dashboard property lama pada boundary client. Error tidak boleh mengungkap metric, recent item, atau PII property yang ditolak.

## 6. Response envelope dan serialisasi angka

### 6.1 Success envelope

Endpoint baru mengikuti DEC-15 dan menggunakan wire `snake_case`:

```json
{
  "data": {
    "active_leases": 0,
    "active_residents": 0,
    "rooms_total": 0,
    "rooms_vacant": 0,
    "rooms_occupied": 0,
    "rooms_maintenance": 0,
    "outstanding_amount": "0",
    "overdue_invoice_count": 0,
    "recent_leases": [],
    "recent_payments": [],
    "timezone": "Asia/Jakarta",
    "generated_at": "2026-07-14T00:00:00.000Z",
    "period_start": "2026-06-30T17:00:00.000Z",
    "period_end": "2026-07-31T17:00:00.000Z"
  }
}
```

Timestamp di atas hanya contoh format, bukan fixture nilai atau clock implementation.

### 6.2 Error envelope

Error tetap mengikuti `GlobalExceptionFilter` existing:

```json
{
  "success": false,
  "error": {
    "code": "...",
    "message": "...",
    "details": {}
  },
  "correlation_id": "...",
  "timestamp": "..."
}
```

Pesan dan details harus aman serta tidak memuat query data, PII, atau identifier lintas scope yang tidak diperlukan.

### 6.3 Angka dan uang

- Count dikirim sebagai JSON integer non-negatif.
- Nominal BIGINT rupiah, termasuk `outstanding_amount` dan `recent_payments[].amount`, dikirim sebagai string desimal basis-10.
- Nilai uang nol dikirim sebagai string `"0"`.
- Backend serializer dan client tidak boleh melewatkan nominal BIGINT melalui JavaScript `Number`.
- Tidak ada desimal, floating point, format lokal, pemisah ribuan, atau simbol mata uang pada wire.

## 7. Recent leases, recent payments, dan PII boundary

### 7.1 Aturan bersama

- Limit server tetap `5`; tidak ada query limit dari client pada Dashboard v1.
- Ordering dan tie-breaker wajib deterministik.
- ID hanya untuk target link internal yang property-scoped dan tidak boleh dirender sebagai label manusia.
- Tidak ada KTP, file URL/path, kontak, alamat, nama resident, raw provider payload, notes, atau identifier actor.
- Empty state menggunakan array kosong, bukan `null`.

### 7.2 `recent_leases`

Sumber: tabel `leases`, property-scoped, seluruh status lease termasuk `active`, `ended`, `cancelled`, dan `transferred`.

Urutan:

```sql
ORDER BY leases.created_at DESC, leases.id DESC
LIMIT 5
```

Whitelist item:

```json
{
  "id": "internal-link-id",
  "lease_code": "LS-...",
  "lease_status": "active",
  "start_date": "2026-07-14",
  "created_at": "2026-07-14T00:00:00.000Z",
  "room": {
    "number": "A-01"
  }
}
```

Dilarang pada item lease: resident ID/nama, KTP, telepon, email, notes, snapshot harga/deposit, invoice, outstanding, occupancy ID, kost type ID, atau room ID sebagai label.

### 7.3 `recent_payments`

Sumber: tabel billing `payments`, bukan payment-gateway transaction. Seluruh status `pending`, `verified`, dan `void` tetap eligible agar Dashboard tidak menyembunyikan state operasional terbaru.

Urutan:

```sql
ORDER BY payments.paid_at DESC NULLS LAST,
         payments.created_at DESC,
         payments.id DESC
LIMIT 5
```

Whitelist item:

```json
{
  "id": "internal-link-id",
  "payment_code": "PAY-...",
  "payment_status": "verified",
  "payment_method": "bank_transfer",
  "amount": "1250000",
  "paid_at": "2026-07-14T00:00:00.000Z",
  "verified_at": "2026-07-14T00:05:00.000Z",
  "created_at": "2026-07-14T00:00:00.000Z"
}
```

Dilarang pada item payment: resident ID/nama, reference number, notes, received/verified actor, allocation detail, invoice/resident relation, provider transaction identifier, payment URL, token, metadata, atau raw provider status.

## 8. Snapshot query, performance, dan N+1

Implementasi kelak wajib memakai:

1. satu repository Dashboard khusus;
2. satu transaction snapshot read-only;
3. satu SQL round-trip berbasis aggregate CTE/scalar aggregates dan dua limited recent subquery; dan
4. query count konstan terhadap jumlah room, resident, lease, invoice, allocation, dan recent item.

Dilarang:

- memanggil list service room/resident/lease/invoice/payment satu per satu;
- mengambil list penuh lalu menghitung di Node.js;
- menjalankan query per recent item;
- melakukan hydration yang memicu N+1; atau
- menggabungkan response dari beberapa snapshot/list endpoint.

Evidence implementasi kelak wajib mencakup:

- reconciliation setiap metric terhadap fixture property;
- bukti jumlah query konstan;
- `EXPLAIN (ANALYZE, BUFFERS)` pada fixture/staging yang representatif;
- review penggunaan index pada scope/status/order yang benar; dan
- observability durasi/query yang tidak membawa PII.

M7-D1 tidak menetapkan target latency millisecond atau volume row karena baseline staging belum tersedia. Budget numerik tetap **DEFERRED** sampai baseline direkam; implementasi tidak boleh mengarang threshold.

## 9. Cutover legacy `useReports`

Saat implementasi Dashboard core kelak disetujui:

1. `useDashboardSummary` harus memakai tepat satu query canonical Dashboard;
2. query key adalah `[dashboard, summary, propertyId]` atau factory equivalent yang menghasilkan scope tersebut;
3. Dashboard tidak boleh mengimpor, menjalankan, atau fallback ke `useReports` untuk metric canonical;
4. error endpoint canonical harus tampil sebagai error/retry, bukan memicu client aggregation tersembunyi;
5. cache dan rendered data property lama harus dibersihkan atau tidak digunakan saat property switch;
6. `useReports` tetap hanya untuk route Reports sampai kontrak Reports terpisah disetujui; dan
7. cutover menggunakan flag read per property sesuai DEC-18, tanpa mencampur angka canonical dan legacy dalam satu render.

Rollback flag boleh mengembalikan seluruh surface lama sebagai unit terpisah, tetapi tidak boleh menyajikan angka legacy sebagai seolah-olah response canonical M7-D1.

## 10. Decision dan gate

### Decision

M7-D1 **APPROVABLE sebagai amendment docs-only Dashboard core v1** dengan keputusan berikut:

- formula core, source domain, snapshot, timezone, RBAC, property semantics, envelope, serialisasi uang, recent items, PII boundary, query shape, dan cutover legacy dibekukan sesuai dokumen ini;
- `verified_revenue_current_month` dan `urgent_maintenance_count` didefer dan absen sepenuhnya dari response v1; dan
- implementasi produk tetap di luar scope amendment ini.

### Gate sebelum implementasi

Patch Dashboard belum boleh dimulai sampai work item implementasi terpisah:

1. merujuk amendment M7-D1 ini sebagai authority;
2. menetapkan file ownership Backend/API, Frontend Integrasi, dan QA;
3. menyediakan contract test untuk exact whitelist dan absence dua field deferred;
4. menyediakan reconciliation fixture, RBAC/property edge-case test, PII test, snapshot consistency test, serta evidence no-N+1;
5. menetapkan rollout/rollback flag property-scoped; dan
6. tidak memperluas scope ke Reports, finance revenue, atau maintenance capability.

`verified_revenue_current_month` hanya dapat kembali melalui amendment finance yang menyelesaikan semantik revenue. `urgent_maintenance_count` hanya dapat kembali melalui amendment maintenance yang menyelesaikan capability read dan formula status/priority.
