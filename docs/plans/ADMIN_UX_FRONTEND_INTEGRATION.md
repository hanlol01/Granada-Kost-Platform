# ADMIN UX — Frontend Integration Analysis

Status: planning only. Dokumen ini tidak mengubah kode aplikasi.

Dokumen ini menerjemahkan kontrak normatif pada
docs/hotfixes/REVISI_UX_ADMIN.md menjadi rancangan integrasi frontend Admin.
Apabila terdapat perbedaan dengan perilaku halaman lama, kontrak hotfix
mengalahkan perilaku lama.

## Keputusan Arsitektur

1. Keluarga Kamar memakai satu parent TanStack Router di bawah /rooms.
   routes/rooms.tsx lama tidak boleh hidup berdampingan dengan
   routes/rooms/index.tsx karena keduanya memetakan URL /rooms.
2. /rooms adalah Ringkasan Kamar, bukan redirect ke Rumah Kost atau Apart
   Kost.
3. /hunian-gallery tetap ada hanya sebagai redirect kompatibilitas ke
   /rooms/galeri dengan replace history.
4. Lease adalah jalur admin tunggal untuk create occupancy, checkout, dan
   transfer. UI baru tidak memanggil mutation occupancy lama untuk lifecycle
   tersebut.
5. Sidebar, breadcrumb, mobile navigation, RBAC, dan feature flag memakai
   satu registry metadata route.
6. routeTree.gen.ts selalu dihasilkan ulang oleh plugin TanStack Router; file
   generated tidak diedit manual.

## 1. Route Map Final TanStack Router

### 1.1 Struktur file final

    routes/
      __root.tsx
      index.tsx
      login.tsx
      rooms/
        route.tsx
        index.tsx
        rumah-kost.tsx
        apart-kost.tsx
        fasilitas.tsx
        galeri.tsx
      penyewaan/
        route.tsx
        index.tsx
        tambah.tsx
        $leaseId.tsx
      syarat-ketentuan.tsx
      hunian-gallery.tsx
      tenants.tsx
      payments.tsx
      vehicles.tsx
      parking.tsx
      booking-leads.tsx
      booking.tsx
      complaints.tsx
      reports.tsx
      notifications.tsx
      settings.tsx
      smart-lock.tsx
      access-history.tsx
      cctv.tsx

rooms/route.tsx adalah parent Outlet dan boundary akses read-level. Ia tidak
boleh memuat tabel/fetch berat yang juga dimuat leaf. rooms/index.tsx adalah
Ringkasan Kamar. Pemindahan dari routes/rooms.tsx harus dilakukan atomik:
pindahkan/pisahkan isinya, lalu hapus file lama pada perubahan yang sama.

Detail lease diputuskan sebagai /penyewaan/$leaseId agar link dari dashboard,
pembayaran, dan penghuni stabil serta dapat di-refresh. Tampilan desktop boleh
berupa drawer lebar, tetapi URL detail tetap ada. Tindakan transfer/checkout
disimpan dalam search state tervalidasi, misalnya panel=transfer atau
panel=checkout, bukan URL action tanpa halaman detail.

### 1.2 Route map dan akses

| URL | Halaman/presentasi | Breadcrumb | Akses minimum |
| --- | --- | --- | --- |
| /login | Login di luar app shell | — | Publik |
| / | Dashboard | Dashboard | dashboard read |
| /rooms | Ringkasan Kamar | Kamar > Ringkasan | room.read |
| /rooms/rumah-kost | Inventori dan header kost type rukost | Kamar > Rumah Kost | room.read |
| /rooms/apart-kost | Inventori dan header kost type apartkost | Kamar > Apart Kost | room.read |
| /rooms/fasilitas | Master fasilitas, kategori, assignment | Kamar > Fasilitas | room.read; write room.manage |
| /rooms/galeri | Galeri target Rumah Kost, Apart Kost, Area Bersama | Kamar > Galeri | room.read; write room.manage |
| /syarat-ketentuan | Aturan global/per kost type | Syarat & Ketentuan | room.read; write room.manage |
| /penyewaan | List lease berpagination server | Penyewaan | lease.read |
| /penyewaan/tambah | Stepper buat lease | Penyewaan > Tambah Penyewaan | lease.manage |
| /penyewaan/$leaseId | Detail lease, transfer, checkout | Penyewaan > label aman | lease.read; action lease.manage/billing.manage |
| /tenants | Penghuni dan riwayat lease | Penghuni | resident capability backend |
| /payments | Invoice dan pembayaran | Pembayaran | billing.read/billing.manage |
| /vehicles?tab=vehicles | Tab Kendaraan | Kendaraan & Parkir > Kendaraan | vehicle.read |
| /vehicles?tab=parking | Tab Parkir | Kendaraan & Parkir > Parkir | parking.read |
| /parking | Redirect compatibility ke tab Parkir | — | parking.read |
| /booking-leads | Minat Booking | Minat Booking | lead capability |
| /booking | Manajemen Booking lama | Tersembunyi bila flag mati | booking flag + capability |
| /complaints | Komplain | Komplain | complaint.read |
| /reports | Laporan | Laporan | report.read |
| /notifications | Notifikasi | Notifikasi | notification.read |
| /settings | Pengaturan | Pengaturan | settings/property capability |
| /smart-lock | Smart Lock | Operasional Terbatas > Smart Lock | device flag + capability |
| /access-history | Access History | Operasional Terbatas > Access History | device flag + capability |
| /cctv | CCTV | Operasional Terbatas > CCTV | device flag + capability |
| /hunian-gallery | Redirect compatibility | — | room.read |

### 1.3 Search params yang perlu distandarkan

Setiap route memakai validateSearch dengan default eksplisit. Nilai lalu
dinormalisasi sebelum dipakai sebagai request dan query key.

| Route | Search state |
| --- | --- |
| /rooms | q, building_id, floor, status, visibility, offset, limit, room_id |
| /rooms/rumah-kost dan /rooms/apart-kost | q, building_id, floor, status, visibility, offset, limit, room_id; kategori ditetapkan oleh path |
| /rooms/fasilitas | q, category_id, kost_type_id |
| /rooms/galeri | target=rumah-kost atau apart-kost atau common-area, offset, limit |
| /penyewaan | q, status, overdue, resident_id, room_id, kost_type_id, offset, limit |
| /penyewaan/$leaseId | panel=detail atau transfer atau checkout; tab=ringkasan/invoice/deposit/riwayat |
| /payments | resident_id, room_id, kost_type_id, lease_id, generation_source, status, offset, limit |
| /vehicles | tab=vehicles atau parking dan filter khusus tab |

URL frontend tidak harus menyimpan UUID target galeri. target=rumah-kost
diselesaikan terlebih dahulu menjadi kost type aktif kategori rukost, lalu
request API selalu membawa target_type=kost_type dan target_id yang eksplisit.

### 1.4 Migrasi /rooms

1. Inventaris seluruh Link, navigate, menu, test, dan bookmark internal yang
   menunjuk ke /rooms.
2. Ekstrak presentasi lama menjadi Ringkasan Kamar di rooms/index.tsx.
3. Tambahkan rooms/route.tsx dan empat leaf Kamar beserta metadata nav/crumb.
4. Ubah semua internal link ke path final; jangan membangun URL string bebas.
5. Hapus routes/rooms.tsx lama dalam perubahan yang sama.
6. Jalankan generator router dan review diff routeTree.gen.ts sebagai output.
7. Uji direct load, refresh, back/forward, active parent Kamar, serta URL
   unauthorized untuk setiap child route.

Tidak ada redirect dari /rooms karena URL tersebut mempertahankan makna baru
yang eksplisit: Ringkasan Kamar.

### 1.5 Redirect /hunian-gallery

routes/hunian-gallery.tsx hanya menjalankan redirect sebelum UI galeri lama
merender:

    /hunian-gallery  ->  /rooms/galeri

Gunakan replace history agar tombol Back tidak membentuk loop. Query legacy
diterjemahkan sebagai berikut:

| Query lama | Query baru | Catatan |
| --- | --- | --- |
| category=rukost | target=rumah-kost | ID aktif diresolusikan route tujuan |
| category=apartkost | target=apart-kost | ID aktif diresolusikan route tujuan |
| tanpa category | target default yang terdokumentasi | Rekomendasi: rumah-kost |
| gender, building, floor | dibuang | Tidak bermakna untuk target galeri baru |
| offset/limit valid | dipertahankan | Tetap divalidasi |

UI baru tidak boleh mengirim category/gender untuk memalsukan area bersama.
Adapter backend dapat mempertahankan pembacaan katalog M19 lama sampai revisi
publik selesai.

### 1.6 Keputusan /parking

Kendaraan dan Parkir digabung sebagai tab pada /vehicles. /parking menjadi
redirect replace ke /vehicles?tab=parking untuk menjaga bookmark. Jika
endpoint/permission Parkir belum kompatibel, route lama boleh bertahan
sementara, tetapi sidebar hanya memiliki satu item Kendaraan & Parkir sampai
cutover selesai.

## 2. Sidebar, Breadcrumb, Mobile Navigation, RBAC, dan Feature Flag

### 2.1 Registry navigasi tunggal

Buat registry metadata route, terpisah dari routeTree.gen.ts, dengan data:

- route id dan link builder;
- label sidebar dan breadcrumb;
- parent, section, urutan, icon;
- read capability dan mutation capability;
- predicate feature flag;
- prioritas mobile;
- resolver label parameter yang aman.

app shell, nav desktop, mobile bottom nav, sheet Lainnya, breadcrumb, dan test
akses mengambil data dari registry ini. Hal itu mencegah label/link/visibility
yang berbeda antar navigasi.

### 2.2 Sidebar desktop

| Section | Item |
| --- | --- |
| MASTER DATA | Dashboard; Kamar (Ringkasan, Rumah Kost, Apart Kost, Fasilitas, Galeri); Syarat & Ketentuan |
| PENGELOLAAN | Penyewaan; Penghuni; Pembayaran; Kendaraan & Parkir; Minat Booking |
| OPERASIONAL TERBATAS | Smart Lock; Access History; CCTV |
| LAINNYA | Komplain; Laporan; Notifikasi; Pengaturan |

Kamar adalah parent collapsible. State expand boleh disimpan per sesi (misalnya
sessionStorage yang namespaced per user/property), tetapi wajib terbuka jika
route aktif adalah /rooms atau descendant-nya. Active parent dihitung dari
route match/path prefix, bukan dari label.

Booking Kamar dan Manajemen Booking tersembunyi bila flag nonaktif. Booking
lead tidak mendapat action perubahan status kamar atau create lease otomatis.

### 2.3 Breadcrumb

Breadcrumb global berada di bawah judul app shell dan menggunakan metadata
registry.

- Parent dapat diklik bila route parent dapat diakses.
- Current page non-clickable.
- Separator chevron memiliki label aksesibel.
- UUID, slug internal, NIK, query pencarian, dan URL file tidak pernah menjadi
  label.
- Detail lease memakai kode lease atau label resident yang telah disanitasi.
  Saat detail masih loading, gunakan Detail Penyewaan, bukan UUID.
- Jika capability parent berubah, hilangkan link parent daripada membuat link
  menuju forbidden page.

### 2.4 Mobile

Lima aksi utama yang direkomendasikan:

1. Dashboard
2. Kamar
3. Penyewaan
4. Penghuni
5. Pembayaran

Setelah filter RBAC/flag, item yang tak diizinkan tidak meninggalkan slot
kosong; gantikan dengan prioritas berikutnya yang diizinkan. Semua route lain
masuk sheet/menu Lainnya memakai registry dan badge yang sama. Aksi penting
tidak boleh hover-only pada 375px, 768px, ataupun 1024px.

### 2.5 RBAC dan flag

| Area | Read/nav | Mutation | Flag/perilaku |
| --- | --- | --- | --- |
| Kamar, fasilitas, galeri, aturan | room.read | room.manage | Tanpa read: hidden + ForbiddenState untuk direct URL |
| Penyewaan | lease.read | lease.manage; close/collect juga billing.manage | property_owner/technician tidak mendapat akses tanpa capability backend |
| Pembayaran | billing.read | billing.manage | Invoice legacy tetap terbuka bila diizinkan |
| Penghuni/PII | capability resident dari backend | resident manage | File KTP mengikuti authorization respons backend |
| Kendaraan/Parkir | vehicle.read/parking.read | capability masing-masing | Room display dari active lease |
| Booking | booking capability | booking capability | Semua route/item tertutup saat flag booking mati |
| Smart Lock/Access/CCTV | capability operasional | capability operasional | Muncul hanya jika device flag dan capability sama-sama true |
| Notifikasi | notification.read | acknowledge bila diizinkan | Badge memakai count dengan filter/otorisasi sama |

Nama flag konkret tetap berasal dari apps/admin/src/lib/features.ts. Registry
tidak boleh mendefinisikan flag kedua. AuthGuard menangani 401; route access
boundary menangani 403 atau feature disabled. Menyembunyikan link bukan
mekanisme keamanan.

Saat property atau akun berubah, hapus cache query property lama sebelum
menghitung nav/capability baru.

## 3. Halaman, Komponen, Hook, dan Client

### 3.1 Route/page

| Target | Perubahan | Integrasi |
| --- | --- | --- |
| routes/rooms/route.tsx dan index.tsx | Baru dari pemecahan rooms.tsx | Parent Outlet; index Ringkasan Kamar |
| rooms/rumah-kost.tsx dan apart-kost.tsx | Baru | Header kost type dan tabel inventori |
| rooms/fasilitas.tsx | Baru | Master kategori/fasilitas/assignment/reorder |
| rooms/galeri.tsx | Baru | Selector target eksplisit dan upload M19 |
| penyewaan/route.tsx, index.tsx, tambah.tsx, $leaseId.tsx | Baru | List, stepper, detail deep-link |
| syarat-ketentuan.tsx | Baru | Rules global/per kost type |
| hunian-gallery.tsx | Ubah | Redirect-only compatibility |
| index.tsx | Ubah | Satu query dashboard summary |
| tenants.tsx | Ubah | Active lease, history, PII/upload baru |
| payments.tsx | Ubah | Filter/link lease/generation source |
| vehicles.tsx dan parking.tsx | Ubah | Tab terpadu/redirect |
| notifications.tsx | Ubah | Filter lifecycle dan unread count |
| booking.tsx | Ubah guard | Tetap ada tetapi flag-gated |

### 3.2 Layout dan shared component

| Target | Perubahan |
| --- | --- |
| components/layout/app-shell.tsx | Grouped sidebar, breadcrumb slot, bottom nav, sheet Lainnya |
| components/layout/nav.tsx | Render registry, sections, Kamar collapsible |
| components/layout/Breadcrumb.tsx | Baru; resolver metadata aman |
| Access boundary | Baru/diekstrak; perilaku konsisten 401, 403, flag off, property switch |
| components/ui/currency-input.tsx | Baru; integer Rupiah, React Hook Form, disabled/error/a11y |
| lib/format.ts | Tambah parseIDR digit-only, integer non-negatif, tolak decimal/overflow |
| components/ui/searchable-select.tsx | Baru; cmdk, keyboard, loading/empty, normalisasi; virtualisasi hanya di atas 500 opsi |
| components/state | Pakai konsisten: LoadingState, EmptyState, ErrorState, ForbiddenState |
| RoomActionMenu | Hilangkan Occupied/Vacant; resident aktif menuju detail lease |
| RoomDetailDrawer | Harga/fasilitas dari kost type; aktif lease yang diizinkan |
| StatusChangeDialog | Hanya maintenance/inactive/requires_review + alasan audit |
| RoomFormDialog | Tidak mengirim harga, deposit, facility assignment |
| GalleryImageCard/GalleryDropzone/GalleryEditDialog | Selalu membawa target_type/target_id dan scope cache target |
| ResidentFormDialog/file components | Field resident baru dan upload terpisah; list tak mengekspos KTP |
| CheckInDialog | Deprecate dari alur admin; jangan hapus sebelum compatibility backend aman |
| LeaseList/LeaseMetricCards/LeaseDetail/LeaseCreateStepper/LeaseTransferPanel/LeaseCheckoutPanel | Baru |
| KostTypeHeader/RoomInventoryTable/RoomFilters/FacilityCategoryEditor/AssignmentChecklist/ReorderControls/GalleryTargetSelector/RuleEditor | Baru |

### 3.3 Hooks

| Hook/client | Perubahan |
| --- | --- |
| useRooms | Filter final, pagination, kost_type_id/category, include_active_lease |
| useRoomMutations | Payload inventori/status legal saja |
| useOccupancyMutations | Tidak dipakai create/close/transfer lease; pertahankan hanya compatibility yang disetujui |
| useRoomFacilities | Master fasilitas dan assignment per kost type, bukan per room |
| useHunianGallery/useHunianGalleryMutations | Scope target eksplisit, upload progress, reorder transactional |
| useDashboardSummary | Satu snapshot dashboard property-scoped |
| useResidents/useResidentMutations | Active lease/history, redaction PII, file upload terpisah |
| useBilling/useBillingMutations/usePaymentTransactions | Filter lease dan invalidation invoice/lease; ledger deposit bukan payment invoice |
| useVehicles/useParking | Room display derived dari active lease |
| useKostTypes/useKostType/useFacilityCategories/useKostTypeRules | Baru |
| useLeases/useLease/useLeaseBillingSummary/useLeaseOverdue/useLeaseMetrics | Baru |
| useLeaseMutations | Baru; create/update note/collect/close/transfer dan idempotency |
| useRoomAvailability | Baru; kamar eligible untuk stepper/transfer |
| query key factory | Baru; satu sumber key dan invalidation |

lib/idempotency.ts menjadi pemilik key lifecycle: buat satu key per intent,
simpan sampai respons terminal, dan pakai ulang hanya untuk retry intent yang
sama. Perubahan intent memerlukan key baru.

### 3.4 packages/api-client dan packages/domain

Tambahkan typed client per domain, bukan fetch langsung dari route:

- kost type, facility category, room facility, kost type rule;
- room inventory dan room availability;
- lease, billing summary, deposit ledger, close, transfer;
- dashboard summary;
- resident detail/file metadata authorized;
- invoice filter baru dan notification count/filter.

Wire response tetap snake_case. Adapter pada tepi API mengubah menjadi
camelCase yang dipakai UI. packages/domain menjadi lokasi enum/status, parser
tanggal/uang, dan invariant bersama; jangan menggandakan enum lease,
generation source, gallery target, atau status room di beberapa halaman.

## 4. Kontrak API per Halaman

### 4.1 Kontrak lintas endpoint

Sebelum UI diaktifkan, endpoint harus membekukan:

- property scope konsisten; jika property_id masih query, ia wajib berada dalam
  query key;
- list memakai data dan meta total/limit/offset;
- envelope error yang membedakan 401, 403, 404, 409, dan 422;
- timezone/format lifecycle tidak ambigu; dashboard berlabel Asia/Jakarta;
- mutation mengembalikan resource terkomit dan warning aman;
- PII/list/file mengikuti redaction backend dan URL file authorized/short-lived;
- Idempotency-Key untuk mutation lifecycle sesuai Fase 0.

### 4.2 Master data Kamar

| Halaman | Request | Data minimum UI |
| --- | --- | --- |
| Ringkasan | GET /rooms dengan q, building_id, floor, status, visibility, kost_type_id/category, limit, offset, include_active_lease | Inventori fisik, kost type ringkas, status/visibility, lease active ringkas, meta |
| Rumah/Apart Kost | GET /kost-types dan GET /kost-types/:id; GET /rooms category/kost_type_id + include_active_lease | Header harga/deposit/ukuran/fasilitas; row resident/start/durasi/next billing/last invoice |
| Edit room | POST/PATCH /rooms | code, building, floor, visibility, kost_type_id dan atribut inventori legal; server menolak price/deposit/facility_ids |
| Status room | Endpoint status existing/final | maintenance/inactive/requires_review + audit reason; 409/422 state illegal |
| Fasilitas | GET/POST/PATCH /facility-categories dan /room-facilities; assignment kost type; reorder | category, icon, order, facility, assignment |
| Syarat | GET/POST/PATCH /kost-type-rules; reorder | global/per-kost-type, text, allowed, icon, sort order |
| Galeri | list/upload/attach/cover/publish/reorder/delete dengan target eksplisit | target_type/target_id, image/order/cover/publish/progress |

Hotfix belum menetapkan nama endpoint assignment/reorder secara rinci. Bekukan
satu kontrak atomik sebelum frontend:

| Operasi | Rekomendasi |
| --- | --- |
| Assignment fasilitas | PATCH /kost-types/:id/facilities dengan seluruh facility_ids target, atau padanan set-replacement transactional |
| Reorder kategori/fasilitas/rules | PATCH resource/reorder dengan seluruh pasangan id dan sort_order/position |
| Reorder galeri | PATCH hunian-gallery/reorder dengan target_type, target_id, ordered_ids lengkap |

Respons harus mengembalikan urutan/assignment final dari server.

### 4.3 Lease, deposit, checkout, transfer

| Halaman/aksi | Request | Kontrak wajib |
| --- | --- | --- |
| List | GET /leases | status, overdue, resident_id, room_id, kost_type_id, q, limit, offset, meta |
| Quick overdue | GET /leases/overdue | Route statis terdaftar sebelum /leases/:id |
| Detail | GET /leases/:id dan GET /leases/:id/billing-summary | Resident ter-mask, room/kost type, snapshot harga, invoice/payment summary, ledger, history tersanitasi, capability action |
| Create stepper | GET room availability atau GET /rooms availability filter; resident search/detail; POST /leases | Kamar vacant dan bukan reserved/maintenance/inactive/requires_review; POST Idempotency-Key; resident baru opsional dalam transaksi |
| Update note | PATCH /leases/:id | Hanya field non-komersial yang diizinkan |
| Deposit | POST /leases/:id/deposit/collect | Integer amount, override reason bila perlu, ledger/result final |
| Checkout | POST /leases/:id/close | Deduction item, outstanding server-calculated, refund final, target room status, confirm, Idempotency-Key |
| Transfer | POST /leases/:id/transfer | Target room, effective date, reason, preview/impact, Idempotency-Key; old/new lease result |

Frontend tidak menghitung sendiri status room, next billing, invoice outstanding,
deposit balance, atau refund sebagai sumber kebenaran. Preview boleh berasal
dari respons server, tetapi submit memakai perhitungan server terbaru. Konflik
409 harus meminta refresh/review, bukan retry buta.

### 4.4 Dashboard dan halaman existing

| Halaman | Kontrak |
| --- | --- |
| Dashboard | GET /dashboard/summary: active_leases, active_residents, rooms_total/vacant/occupied/maintenance, verified_revenue_current_month, outstanding_amount, overdue_invoice_count, recent_leases, recent_payments, urgent_maintenance_count, timestamp/timezone |
| Penghuni | List/detail/form diperkaya active lease, history, vehicle, payment summary; list tanpa URL KTP; detail hanya metadata/tautan authorized |
| Pembayaran | GET /invoices dengan resident_id, room_id, kost_type_id, lease_id, generation_source, status; lease_id nullable untuk invoice legacy |
| Kendaraan/Parkir | Endpoint property-scoped; room display derived dari active lease dan tetap valid untuk resident tanpa lease |
| Notifikasi | List/filter lifecycle dan unread count menggunakan filter/authorization identik |
| File resident | Upload purpose ktp/profile_photo terpisah; detail authorized, bukan storage_path/raw URL |

### 4.5 Kontrak yang harus ditandatangani sebelum sprint

1. Endpoint/payload final assignment dan reorder fasilitas/rules.
2. Endpoint galeri target baru, termasuk upload M19, cover, publish, delete.
3. Filter room availability dan preview checkout/transfer.
4. Error envelope 409 versus 422 dan field error.
5. Capability summary property/role dan batas PII.
6. Kontrak file KTP/profile photo dan lifetime URL.
7. Shape mapper snake_case ke camelCase pada api-client.
8. Aturan version/ETag konflik reorder bila tersedia.

## 5. Query Key, Invalidation, Optimistic Update, dan UI State

### 5.1 Query key factory

Setiap key menyertakan propertyId. Query string ditrim, default dihilangkan,
array diurutkan bila urutan tidak bermakna, dan limit/offset tervalidasi.

| Domain | Key |
| --- | --- |
| Dashboard | [dashboard, summary, propertyId] |
| Kost type | [kostTypes, propertyId, filters]; [kostType, propertyId, id] |
| Room | [rooms, propertyId, normalizedFilters]; [room, propertyId, id]; [roomAvailability, propertyId, filters] |
| Facility | [facilityCategories, propertyId]; [roomFacilities, propertyId, filters]; [kostTypeFacilities, propertyId, kostTypeId] |
| Rules | [kostTypeRules, propertyId, scope, kostTypeId] |
| Gallery | [hunianGallery, propertyId, targetType, targetId, page] |
| Lease | [leases, propertyId, filters]; [lease, propertyId, leaseId]; [leaseBillingSummary, propertyId, leaseId]; [leaseOverdue, propertyId, filters] |
| Resident | [residents, propertyId, filters]; [resident, propertyId, residentId] |
| Invoice/payment | [invoices, propertyId, filters]; [invoice, propertyId, invoiceId]; [paymentTransactions, propertyId, filters] |
| Vehicle/parking | [vehicles, propertyId, filters]; [parking, propertyId, filters] |
| Notification | [notifications, propertyId, filters]; [notificationUnreadCount, propertyId, filters] |

Jangan gunakan key terlalu umum seperti [rooms] atau [leases], karena cache
property A tidak boleh tampil sesaat pada property B.

### 5.2 Invalidation matrix

| Mutation | Invalidate/refetch minimal | Policy optimistic |
| --- | --- | --- |
| Create/update kost type | kost type list/detail, room list terkait, dashboard jika metric memakai tipe | Detail/form terbatas; perubahan harga gunakan respons server lalu invalidate |
| Patch room/status | room/list terkait, availability, dashboard bila metric berubah | Satu row boleh optimistic dengan snapshot rollback |
| Assignment/reorder fasilitas/rules | scope tepat, kost type detail, room view fasilitas | Wajib cancel, snapshot, apply full target, rollback, settle invalidate |
| Gallery attach/cover/publish/reorder/delete | Gallery target tepat dan kost type detail bila cover dipakai | Reorder/cover scoped optimistic; upload tunggu server sukses |
| Create lease | lease lists/detail, rooms/availability, resident, invoices, dashboard, notification count | Tidak optimistic |
| Update note | detail/list row lease | Boleh optimistic kecil bila rollback ada |
| Collect deposit | lease detail/billing summary, invoice/payment/dashboard bila relevan | Prefer respons server; saldo ledger tidak dihitung lokal |
| Close lease | lease, lease lists, rooms/availability, resident, invoice, dashboard, notifications | Tidak optimistic |
| Transfer | old/new lease, lease list, dua room/availability, resident, dashboard, invoice/payment, notifications | Tidak optimistic |
| Resident/file | resident list/detail, lease detail bila label berubah | Jangan cache URL KTP di list |
| Invoice/payment | invoice/payment, lease billing summary, dashboard/report | Refetch summary server |
| Vehicle/parking | vehicle/parking, resident, display room | Optimistic hanya field lokal non-lease |
| Notification read | notifications dan count dengan filter sama | Optimistic bila rollback didukung |

Gunakan respons mutation untuk mengisi cache detail bila shape lengkap, lalu
invalidate list yang terdampak. Jangan invalidate seluruh cache tanpa scope.

### 5.3 Aturan optimistic

Optimistic hanya untuk operasi lokal, reversibel, scope sempit: reorder,
cover galeri, publish toggle, atau status inventori legal.

1. Cancel query scope tepat.
2. Simpan snapshot.
3. Terapkan payload atomik yang sama pada cache.
4. Rollback saat gagal.
5. Invalidate saat settle.

Create/close/transfer lease, invoice pertama, deposit balance, dan refund
tidak boleh optimistic karena backend melakukan lock dan transaksi.

### 5.4 Loading/error/empty/forbidden

| State | Perilaku |
| --- | --- |
| Loading awal | Skeleton/LoadingState di area konten; shell/breadcrumb/filter tetap |
| Background refetch | Data terakhir tetap tampil dengan indikator ringan |
| Network/5xx | ErrorState + retry query sama; pesan aman tanpa PII |
| 422 | Field error, fokus ke error pertama, input tidak hilang |
| 409 | Jelaskan konflik, refresh/review; tidak auto retry lifecycle |
| Empty tanpa filter | EmptyState domain + CTA hanya bila write capability |
| Empty hasil filter | Reset filter; bukan CTA create menyesatkan |
| 403/flag off | ForbiddenState; bersihkan data sensitif; jangan redirect diam-diam |
| 404 | State berbeda dari 403 dengan link parent aman |
| Pending mutation | Disable submit, progress label, double-submit prevention, idempotency lifecycle |

## 6. Risiko Kompatibilitas

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| rooms.tsx dan rooms/index.tsx bersama | Collision route/generator | Migrasi atomik dan generate tree |
| routeTree.gen.ts diedit manual | Regenerasi menimpa/perilaku build salah | Treat as generated artifact |
| Room UI lama kirim harga/deposit/fasilitas/Occupied/Vacant | API baru menolak atau melanggar sumber kebenaran | Pecah form/action; gate action legacy |
| Occupancy/check-in lama dipakai paralel | Occupancy tanpa lease, room status inkonsisten | Hilangkan entry point admin; delegasi/conflict backend |
| Galeri lama category/gender | Area bersama salah target | Adapter read, redirect, target explicit mutation |
| Payment mengasumsikan semua invoice punya lease | Invoice legacy lease_id null rusak | Link kondisional dan fallback legacy |
| Resident list/detail bocor PII | KTP/NIK masuk cache/log/breadcrumb | List/detail type terpisah, redaction, authorized file |
| Dashboard fan-out request | N+1, flicker, angka tidak konsisten | Summary snapshot tunggal |
| Vehicle room snapshot | Transfer membuat room display salah | Derive dari active lease |
| Bookmark /parking dan /hunian-gallery | Broken/dead back history | Redirect replace + test |
| Sidebar hide only | Direct URL/cached data bypass UX | Route boundary + backend enforcement |
| Flag desktop/mobile berbeda | Nav tidak konsisten | Registry dan evaluator tunggal |
| Key tanpa property scope | Data lintas property | propertyId di semua key, clear on switch |
| Mobile refactor menyembunyikan action | Operasional terganggu | Bottom nav + sheet Lainnya + responsive test |
| Breadcrumb UUID | UX buruk/potensi exposure | Resolver label aman dan fallback generik |

## 7. Urutan Implementasi Setelah API Contract Dibekukan

API contract dianggap beku setelah bagian 4.5, contoh respons sukses/error,
capability matrix, dan fixture QA tersedia.

1. **Foundation type dan boundary**
   - Tambah typed client/domain mapper, error normalizer, query-key factory,
     capability evaluator, property cache reset.
   - Uji mapper, canonicalization key, dan 401/403/409/422.

2. **Router dan navigasi**
   - Migrasi /rooms atomik, parent/leaf route, redirect compatibility, route
     registry, breadcrumb, sidebar grouped, mobile nav, access boundary.
   - Regenerate routeTree.gen.ts; uji direct route/redirect/RBAC/flag.

3. **Primitif UX**
   - CurrencyInput, SearchableSelect, search parser, state boundary, pending
     mutation pattern, idempotency form helper.
   - Uji keyboard, focus, error, 375px/768px/1024px.

4. **Master data Kamar**
   - Ringkasan, Rumah Kost, Apart Kost memakai kost type/rooms API.
   - Migrasi RoomFormDialog/drawer/action menu ke inventori legal.
   - Fasilitas, aturan, galeri setelah endpoint assignment/reorder/target final.

5. **Penyewaan inti**
   - List/filter/pagination, detail, link dari room.
   - Stepper create dengan availability/idempotency.
   - Billing summary/deposit lalu checkout/transfer setelah preview and conflict
     API serta test backend tersedia.

6. **Dashboard**
   - Alihkan ke dashboard summary tunggal dan quick action route stabil.

7. **Integrasi halaman existing**
   - Penghuni, Pembayaran, Kendaraan/Parkir, Notifikasi; pertahankan fallback
     legacy sampai adapter backend tidak lagi diperlukan.

8. **Polish dan cutover**
   - Test component/route/access/rollback/redirect/PII; lint, typecheck,
     build, manual desktop/mobile sebelum nav/flag dinyalakan untuk semua role.

## Definition of Done Frontend

- Tidak ada route collision dan routeTree.gen.ts dihasilkan generator.
- /rooms, child route, /penyewaan, dan redirect legacy direct-load, refresh,
  back/forward, serta search state valid.
- Sidebar, breadcrumb, mobile Lainnya, RBAC, dan flag memakai registry tunggal.
- Halaman API memiliki loading, background refetch, error/retry, empty,
  forbidden, 404, 409, dan pending state yang tepat.
- Query key property-scoped; lifecycle mutation menginvalidasi modul terkait.
- Create/close/transfer lease tidak optimistic dan mencegah double submit
  dengan Idempotency-Key.
- Room, gallery, tenant, payment, vehicle, parking, dashboard, dan
  notification tidak meregresikan contract legacy selama masa adapter.
- UI/cache/breadcrumb tidak mengekspos NIK, URL KTP, storage path, atau UUID
  sebagai label manusia.
- Lint, typecheck, build, dan test pada verification plan lulus.

