# Admin UX M7-N0 — Notification Read-only Contract

> **Status:** Kontrak normatif M7-N0. Mengotorisasi patch read-only M7-N1
> setelah approval terpisah; dokumen ini sendiri tidak mengubah source, test,
> migration, seed, route generated, atau Git state.
>
> **Authority:** `ADMIN_UX_FINAL_INTEGRATION.md` §2 DEC-12 dan DEC-15, §4 M7,
> serta `ADMIN_UX_M7_INTEGRATION_CONTRACT.md` §§1–5.

## 1. Scope dan evidence existing

M7-N0 membekukan satu list notifikasi Admin yang property-scoped dan read-only.
CSV, Dashboard, M6, M8, Payment Gateway, provider delivery, dan mutasi
notifikasi berada di luar scope.

Fakta existing berikut bukan endpoint M7-N1:

- `GET /api/v1/my/notifications` adalah inbox recipient-scoped dan memiliki
  mutation read/archive (`MyNotificationController`).
- `GET /api/v1/notifications` adalah surface delivery operational, bukan list
  Admin notification record (`NotificationDeliveryController`).
- Permission existing `notification.manage` dimiliki owner, manager, dan admin
  pada RBAC seed; tidak dibuat permission atau flag baru.

Kedua endpoint existing tidak boleh dipakai ulang, diubah, atau diberi media
type baru oleh M7-N1.

## 2. CONTRACT DECISION — endpoint dan access

M7-N1 mengimplementasikan endpoint **baru**:

```text
GET /api/v1/admin/notifications
```

Ini adalah keputusan kontrak baru, bukan klaim endpoint existing.

Endpoint wajib memakai `JwtAuthGuard`, `RbacGuard`, role `owner|manager|admin`,
dan permission `notification.manage`. Actor harus berada dalam property scope
yang dihitung server-side; owner global boleh membaca seluruh property, sedangkan
manager/admin hanya property assignment aktifnya. Property owner, technician,
dan resident ditolak walaupun mengetahui UUID property.

`property_id` adalah query wajib UUID. Missing `property_id` adalah
`400 PROPERTY_ID_REQUIRED`; UUID/query invalid memakai validation error existing.
Sesudah validasi query, M7-N1 wajib mengikuti convention backend existing:
`PropertyService.assertCanReadProperty()` memeriksa scope lebih dahulu dan
menghasilkan `403 PROPERTY_SCOPE_DENIED` tanpa lookup existence bagi actor di luar
scope; lookup/read model hanya boleh menghasilkan `404 PROPERTY_NOT_FOUND` setelah
scope lolos. Referensi implementasi: `backend/api/src/modules/property/property.service.ts`
`assertCanReadProperty()` dan pemanggil list property-scoped existing, termasuk
`RoomService.list()`, `ResidentService.list()`, dan `OccupancyService.list()`.
Dengan demikian M7-N1 tidak menetapkan precedence 404-before-403 baru dan tidak
mengungkap existence property kepada actor di luar scope.

## 3. CONTRACT DECISION — request, response, dan data boundary

Query yang diizinkan:

```text
property_id=<uuid>                 required
status=unread|read|archived        optional
limit=<1..100>                     optional, default 20
offset=<integer >= 0>              optional, default 0
```

Hasil diurutkan `created_at DESC, id DESC`. Wire baru memakai snake_case dan
selalu berbentuk:

```json
{
  "data": [
    {
      "id": "uuid",
      "notification_type": "billing.invoice_issued",
      "notification_status": "unread",
      "priority": "normal",
      "created_at": "RFC3339",
      "expires_at": "RFC3339|null"
    }
  ],
  "meta": { "limit": 20, "offset": 0, "total": 0 }
}
```

`data[]` adalah whitelist tertutup. Tidak boleh mengirim atau memasukkan ke
cache/UI: `property_id`, `recipient_user_id`, title, body, metadata,
source_event_type, source_resource_id, correlation_id, read_at, alamat tujuan,
provider, delivery status, file URL/path, KTP, atau PII lain. `notification_type`
pada wire adalah enum tertutup yang mengikuti `NOTIFICATION_TYPES` existing:
`billing.invoice_issued`, `billing.invoice_overdue`, `complaint.created`,
`complaint.resolved`, `maintenance.work_order_assigned`, `vehicle.approved`,
`occupancy.check_in_completed`, `occupancy.check_out_finalized`, atau `other`.
Repository/mapper wajib menormalisasi nilai database yang tidak termasuk allowlist
menjadi literal `other` sebelum response, cache, atau UI; raw string tidak dikenal
tidak boleh diteruskan. Authority enum existing:
`backend/api/src/modules/notification/constants/notification.constants.ts`
`NOTIFICATION_TYPES`. UI menampilkan fallback generik untuk `other` dan tidak
menginterpretasi metadata.

## 4. Read model dan state frontend

Repository M7-N1 membaca hanya notification record untuk `property_id` target,
dengan filter status opsional, satu count pagination, dan tanpa join recipient,
delivery, file, lease, atau resident. Tidak ada N+1 dan tidak ada hydration per
item.

Query key Admin wajib mengandung property ID, status, limit, dan offset. Saat
property berubah, snapshot property lama tidak boleh dirender sebagai property
baru. UI wajib membedakan loading, empty, error, dan forbidden.

M7-N1 tidak melakukan polling, mark-read, archive, retry provider, optimistic
mutation, export, detail endpoint, atau delivery diagnostics. Route `/notifications`
existing dan entry registry/menu existing tetap dipakai; M7-N1 mengganti isi surface
tersebut dengan read model baru tanpa menambah, menghapus, atau mengubah file route.
Route/menu/query harus fail-closed saat role atau `notification.manage` tidak
tersedia. `routeTree.gen.ts` tidak diedit manual dan tidak diharapkan berubah karena
path serta deklarasi route existing tetap sama; bila tooling tetap menghasilkan diff
generated route, diff tersebut berada di luar scope M7-N1 dan tidak boleh di-stage.

## 5. Acceptance untuk M7-N1

Patch implementasi berikutnya harus membuktikan:

1. exact role, permission, dan convention property scope existing: actor di luar
   scope menerima `403 PROPERTY_SCOPE_DENIED` tanpa existence lookup, sedangkan
   `404 PROPERTY_NOT_FOUND` hanya mungkin setelah scope lolos;
2. request property-scoped dan query count konstan tanpa N+1;
3. exact response whitelist, normalisasi unknown `notification_type` menjadi
   `other`, serta absence seluruh PII/forbidden field dan raw unknown type;
4. pagination, ordering, status filter, empty, forbidden, dan error state;
5. cache/query key property boundary dan tidak ada stale cross-property render;
6. route/menu existing dipakai dengan guard fail-closed tanpa perubahan path atau
   deklarasi route; tidak ada generated route change;
7. tidak ada mutation, polling, endpoint existing reuse, Dashboard, M6, M8,
   CSV, Payment Gateway, migration, atau seed.

M7-N1 dapat mengubah backend/frontend/test yang diperlukan oleh kontrak ini,
tetapi tidak boleh memperluas contract tanpa amendment baru.
