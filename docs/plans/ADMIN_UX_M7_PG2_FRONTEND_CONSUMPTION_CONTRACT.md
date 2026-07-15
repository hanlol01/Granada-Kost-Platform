# Admin UX M7-PG2 — Payment Gateway Frontend Consumption Contract

> **Status:** Kontrak normatif implementasi Admin read-only untuk tab **Online** pada
> route existing `/payments`; patch dokumen ini sendiri tidak mengubah source, test,
> migration, seed, generated route, atau Git state selain file ini.
>
> **Authority:** `ADMIN_UX_M7_B0_PAYMENT_GATEWAY_READ_ONLY_CONTRACT.md`,
> `ADMIN_UX_M7_B1_PAYMENT_GATEWAY_PROPERTY_SCOPE_CONTRACT.md`, serta endpoint existing
> pada `backend/api/src/modules/payment-gateway/`.

## 1. Scope dan endpoint

Tab **Online** hanya boleh memakai:

- `GET /api/v1/admin/payment-transactions` untuk list;
- `GET /api/v1/admin/payment-transactions/:transactionId` untuk detail.

Tidak ada endpoint Payment Gateway lain yang mendapat authority. Request wajib melalui
authenticated `apiClient`; frontend guard hanya UX dan backend tetap policy enforcement
point. Route `/payments` existing wajib dipakai tanpa route atau menu baru.

## 2. Request dan wire contract

Query list yang diizinkan:

```text
property_id=<uuid>   required oleh frontend
status=created|pending|paid|failed|expired|cancelled|denied|challenge|requires_review|unknown   optional
limit=<1..100>       optional, default 20
offset=<integer>=0   optional, default 0
```

List diurutkan `created_at DESC`. Respons list wajib tepat:

```json
{
  "data": [{ "id": "uuid", "invoiceId": "uuid", "propertyId": "uuid" }],
  "meta": { "limit": 20, "offset": 0, "total": 1 }
}
```

`data[]` memakai whitelist §3; `meta` hanya `limit`, `offset`, dan `total` integer
non-negatif. Bare array, `{items}`, cursor, inferred total, dan wrapper permisif dilarang.
Detail menerima hanya `transactionId` yang berasal dari list dan merespons tepat
`{"data": <whitelist-record>}` tanpa `meta`. Bare object dan lookup berdasarkan property
dari request dilarang.

## 3. Whitelist transport, cache, dan UI state

Record list/detail hanya boleh memiliki field B1 berikut:

```text
id, invoiceId, propertyId, residentId, requestedByUserId, provider,
providerOrderId, amount, currency, status, paymentMethod, createdAt,
updatedAt, paidAt, failedAt
```

Parser wajib menyalin whitelist sebelum cache. `residentId` dan `requestedByUserId`
tetap opaque transport/cache values dan tidak boleh dirender, dicatat ke log/error, atau
di-hydrate menjadi profil. Field tambahan wajib dibuang sebelum cache dan tidak boleh
dipakai sebagai fallback UI.

## 4. Access, property boundary, dan state UI

Kedua endpoint hanya untuk role `manager|admin` dengan permission `billing.read`.
Frontend wajib mengirim property aktif sebagai `property_id` pada list dan fail-closed
tanpa role, permission, atau property aktif. Backend wajib mengikuti B1: explicit property
divalidasi sebelum query; list tanpa property tetap terbatas pada `user.propertyIds` dan
scope kosong menghasilkan list kosong; detail diotorisasi memakai persisted
`transaction.propertyId`; cross-property menghasilkan `403 PROPERTY_SCOPE_DENIED` tanpa
kebocoran record.

Query key list wajib memuat property ID, status, limit, dan offset; key detail wajib memuat
property ID dan transaction ID. Pergantian property tidak boleh merender snapshot, detail,
atau error property sebelumnya. List dan detail wajib membedakan loading, empty/not-found,
error, dan forbidden; empty tidak boleh menyamarkan error atau forbidden.

## 5. Denylist dan acceptance

Dilarang: create/update/verify/reject/settle/refund/delete, polling, webhook action,
provider refresh, Midtrans call, optimistic mutation, export, serta endpoint/flag baru.
Raw provider payload/status/error, provider transaction ID, payment URL, Snap/token lain,
metadata, signature, server/client key, webhook secret, credential, Basic auth value,
nama, email, telepon, KTP, alamat, URL/path file, dan PII lain tidak boleh masuk response,
cache, UI, log, atau error. `routeTree.gen.ts` tidak boleh diedit manual atau di-stage.

Acceptance wajib membuktikan exact request/envelope/pagination/detail dan whitelist;
manager/admin + `billing.read`; property scope list/detail dan cache boundary; seluruh state
UI; absence denylist; hanya dua GET di atas; serta tidak ada mutation atau generated-route
change. Ketidaksesuaian endpoint existing wajib fail-closed dan diperbaiki dalam scope
kontrak ini, bukan ditoleransi dengan parser multi-shape.
