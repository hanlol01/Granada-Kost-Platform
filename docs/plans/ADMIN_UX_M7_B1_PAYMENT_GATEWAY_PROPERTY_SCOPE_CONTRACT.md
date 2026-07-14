# Admin UX M7-B1 — Kontrak Property Scope Payment Gateway Admin

> **Status:** Kontrak normatif M7-B1 untuk regression coverage backend; tidak mengubah kode produksi.
>
> **Authority utama M7:** `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §1, §2 DEC-12 dan DEC-15, §4 baris “M7 — Integrasi modul & dashboard”, serta §5 ownership dan batas file.
>
> **Authority pendukung:** `docs/plans/ADMIN_UX_M7_B0_PAYMENT_GATEWAY_READ_ONLY_CONTRACT.md`; implementasi backend yang disetujui pada `backend/api/src/modules/payment-gateway/payment-gateway.admin.controller.ts`, `payment-gateway.service.ts`, dan `payment-gateway.repository.ts`; serta `backend/api/src/modules/property/property.service.ts` dan `backend/api/src/modules/rbac/guards/rbac.guard.ts`.

## 1. Resolusi M7-B0 dan scope

M7-B1 secara aditif menyelesaikan status `NEW CONTRACT REQUIRED` untuk property scope server-side pada:

- `GET /api/v1/admin/payment-transactions`;
- `GET /api/v1/admin/payment-transactions/:id`.

M7-A dan M7-B0 tetap tidak berubah. Kontrak ini tidak memberi authority untuk mutation, endpoint payment lain, perubahan frontend, kode produksi, M6, M8, CSV, migration, seed, atau perluasan role/permission.

## 2. RBAC dan property scope

1. Kedua endpoint hanya tersedia untuk role `manager` atau `admin` yang memiliki permission `billing.read`. JWT authentication dan `RbacGuard` tetap menjadi enforcement point.
2. List dengan `property_id` wajib memanggil `PropertyService.assertCanReadProperty(user, property_id)` sebelum query dan hanya boleh meneruskan property tersebut.
3. List tanpa `property_id` wajib dibatasi pada `user.propertyIds`. Scope kosong menghasilkan list kosong dan tidak membuka query global.
4. Detail wajib mengambil transaksi berdasarkan ID, lalu memverifikasi akses melalui `PropertyService.assertCanReadProperty(user, transaction.propertyId)` sebelum respons dikembalikan. Property dari request tidak boleh menggantikan property persisted pada transaksi.
5. Akses lintas properti wajib fail-closed dengan `PROPERTY_SCOPE_DENIED`. Respons error tidak boleh membawa data transaksi, opaque ID subjek, PII, atau material provider sensitif.

## 3. Whitelist respons

List dan detail hanya boleh mengembalikan field berikut:

- `id`;
- `invoiceId`;
- `propertyId`;
- `residentId`;
- `requestedByUserId`;
- `provider`;
- `providerOrderId`;
- `amount`;
- `currency`;
- `status`;
- `paymentMethod`;
- `createdAt`;
- `updatedAt`;
- `paidAt`;
- `failedAt`.

`residentId` dan `requestedByUserId` boleh dipertahankan sebagai ID opaque dalam transport dan cache. Keduanya tidak boleh diperluas menjadi profil identitas, dirender sebagai PII, atau dimasukkan ke log maupun error.

Field dan material berikut dilarang keluar melalui respons, log, atau error kedua endpoint:

- nama, email, telepon, KTP, alamat, URL/path file, atau atribut identitas lain;
- raw provider payload dan raw error body;
- signature, server key, client key, webhook secret, credential, atau Basic auth value;
- payment URL, Snap token atau token lain;
- metadata blob, raw provider status, dan field tambahan yang diinfer dari metadata provider.

Field provider-neutral yang sudah dinormalisasi pada whitelist bukan raw provider payload.

## 4. Enforcement map

| Kontrak | Enforcement yang disetujui |
|---|---|
| Route, role, permission, list/detail scope | `backend/api/src/modules/payment-gateway/payment-gateway.admin.controller.ts` |
| Read service dan whitelist respons | `backend/api/src/modules/payment-gateway/payment-gateway.service.ts` |
| SQL list property-scoped dan lookup detail | `backend/api/src/modules/payment-gateway/payment-gateway.repository.ts` |
| Property denial `PROPERTY_SCOPE_DENIED` | `backend/api/src/modules/property/property.service.ts` |
| Semantik role dan permission | `backend/api/src/modules/rbac/guards/rbac.guard.ts` |

## 5. Acceptance dan non-goals

Regression test M7-B1 wajib mengunci:

- manager/admin + `billing.read` dan denial bila role/permission tidak memenuhi;
- list default dan explicit-property scope;
- denial list/detail lintas properti;
- detail scope berdasarkan property persisted pada transaksi;
- exact response whitelist untuk list/detail;
- retensi dua opaque ID tanpa kebocoran PII, raw provider data, secret, token, metadata, log, atau error.

M7-B1 tidak mengubah implementasi payment gateway. Jika regression test menemukan ketidaksesuaian, pekerjaan berhenti untuk amendment atau patch terpisah; scope tidak diperluas secara diam-diam.
