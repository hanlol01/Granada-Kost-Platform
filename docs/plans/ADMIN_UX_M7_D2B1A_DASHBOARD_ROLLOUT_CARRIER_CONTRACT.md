# Admin UX M7-D2B1A — Kontrak Carrier Rollout Dashboard

> **Status:** Amendment dokumentasi normatif M7-D2B1A untuk carrier rollout Dashboard canonical; tidak mengizinkan patch source atau test.
>
> **Authority utama:** `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §2 DEC-18, `docs/plans/ADMIN_UX_M7_D0_DASHBOARD_SUMMARY_CONTRACT.md`, `docs/plans/ADMIN_UX_M7_D1_DASHBOARD_CORE_SUMMARY_DECISION.md`, dan `docs/plans/ADMIN_UX_M7_D2B0_DASHBOARD_FRONTEND_ROLLOUT_DECISION.md`.
>
> **Keputusan:** `GET /api/v1/auth/me` adalah satu-satunya carrier terautentikasi untuk rollout `admin_ux_read` per property. Direct cutover tanpa carrier tidak diotorisasi.

## 1. Scope dan hierarchy authority

M7-D2B1A menutup keputusan exact carrier, wire, property enumeration, freshness, rollback, serta authority operator untuk rollout Dashboard canonical.

Amendment ini hanya membekukan kontrak carrier. Amendment ini tidak:

- mengubah metric atau response Dashboard Core v1;
- mengizinkan patch backend, frontend, shared package, atau test;
- membuat migration atau seed enable;
- menambahkan flag ke JWT;
- membuat endpoint Dashboard atau carrier kedua;
- mengizinkan direct cutover;
- mengizinkan fallback ke `useReports`; atau
- mengubah M6, M8, CSV, payment gateway, dan route generated.

Jika terdapat perbedaan, hierarchy authority tetap:

1. `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md`, khususnya DEC-18;
2. amendment M7-D2B1A ini untuk carrier rollout;
3. M7-D2B0 untuk authority rollout frontend dan larangan direct cutover;
4. M7-D1 untuk response serta semantics Dashboard Core v1;
5. M7-D0 untuk endpoint canonical dan invariant yang tidak diamend; dan
6. implementasi existing hanya menjadi evidence, bukan authority baru.

## 2. Registry fakta discovery

Bagian ini mencatat **EXISTING EVIDENCE**, bukan keputusan produk baru.

| Fakta discovery                                                                                                                                                                            | Evidence                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage rollout per property sudah tersedia. `property_feature_flags.property_id` adalah primary key dan `admin_ux_read` bertipe boolean non-null dengan default false.                    | `backend/api/src/infrastructure/database/migrations/018_lease_m6_runtime.sql:20-35`                                                          |
| Migration sengaja tidak melakukan backfill; property tetap disabled sampai row dibuat atau diubah secara eksplisit.                                                                        | `backend/api/src/infrastructure/database/migrations/018_lease_m6_runtime.sql:3-6`                                                            |
| Row flag yang tidak ada sudah diperlakukan sebagai seluruh flag false.                                                                                                                     | `backend/api/src/modules/lease/lease-feature.service.ts:19-22,61-81`                                                                         |
| `/api/v1/auth/me` adalah endpoint bootstrap terautentikasi existing.                                                                                                                       | `backend/api/src/modules/auth/auth.controller.ts:73-77`                                                                                      |
| Response auth existing memakai field camelCase `displayName` dan `propertyIds`, dengan `property_ids` sebagai compatibility alias. Response belum membawa rollout flag.                    | `backend/api/src/modules/auth/auth.service.ts:318-329`; `backend/api/src/modules/auth/types/auth-response.types.ts:1-13`                     |
| `UserAccessContext` memuat identity, roles, permissions, property IDs, dan session ID, tetapi belum rollout flag.                                                                          | `backend/api/src/modules/iam/types/iam.types.ts:22-31`                                                                                       |
| Access context mengambil role, permission, dan assigned-property scope dari database. Query existing memfilter `user_property_roles.user_id` dan `user_property_roles.revoked_at IS NULL`. | `backend/api/src/modules/iam/repositories/iam.repository.ts:177-215`, khususnya `:188-196`                                                   |
| `JwtAuthGuard` memuat ulang access context database pada authenticated request.                                                                                                            | `backend/api/src/modules/rbac/guards/jwt-auth.guard.ts:43-60`                                                                                |
| JWT existing tidak membawa rollout flag.                                                                                                                                                   | `backend/api/src/modules/auth/auth.service.ts:278-290`                                                                                       |
| Frontend mengambil `/auth/me` setelah bootstrap refresh dan setelah login.                                                                                                                 | `apps/admin/src/lib/auth/AuthProvider.tsx:59-92`                                                                                             |
| `refreshMe()` tersedia, tetapi discovery tidak menemukan caller.                                                                                                                           | `apps/admin/src/lib/auth/AuthProvider.tsx:108-111`                                                                                           |
| Property switch sudah membatalkan dan menghapus query cache, tetapi belum me-refresh carrier.                                                                                              | `apps/admin/src/lib/property/PropertyProvider.tsx:55-70`                                                                                     |
| Owner global dapat memiliki assignment `property_id = NULL`; aggregation access context menghapus nilai null sehingga owner global dapat memiliki `propertyIds: []`.                       | `backend/api/src/infrastructure/database/scripts/seed-core.ts:166-173`; `backend/api/src/modules/iam/repositories/iam.repository.ts:184-196` |
| Tidak ditemukan product controller, service, atau runbook runtime yang mengubah `property_feature_flags` untuk canary.                                                                     | Discovery M7-D2B1 terhadap backend modules dan database scripts.                                                                             |
| Migration baru dan seed enable tidak dibutuhkan untuk menambahkan carrier.                                                                                                                 | Schema migration 018 dan semantics absent-row false di atas.                                                                                 |

Tidak ada semantics assignment, property lifecycle, operator authority, refresh SLA, atau wire baru yang boleh diinfer dari fakta tersebut. Keputusan baru dinyatakan terpisah di bagian berikut.

## 3. Carrier tunggal dan exact wire

### 3.1 Opsi yang dinilai

| Opsi | Bentuk                                                | Pertimbangan                                                                                                         |
| ---- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1    | `property_rollouts[].property_id` dan `admin_ux_read` | Meniru Dashboard snake_case, tetapi tidak mengikuti shape utama AuthMe existing.                                     |
| 2    | `propertyRollouts[].propertyId` dan `adminUxRead`     | Mengikuti casing camelCase AuthMe existing dan tetap additive.                                                       |
| 3    | Menaruh flag di `properties[]`                        | `properties[]` belum menjadi response backend auth yang stabil dan dapat mencampur identity property dengan rollout. |

### 3.2 Keputusan baru

M7-D2B1A memilih **opsi 2**. `GET /api/v1/auth/me` adalah satu-satunya carrier terautentikasi dan menambahkan field additive berikut:

```json
{
  "propertyRollouts": [
    {
      "propertyId": "11111111-1111-4111-8111-111111111111",
      "adminUxRead": {
        "enabled": false
      }
    }
  ]
}
```

Exact field paths:

```text
propertyRollouts[].propertyId
propertyRollouts[].adminUxRead.enabled
```

Kontrak wire:

1. `propertyRollouts` selalu array; array kosong sah.
2. Setiap authorized property muncul paling banyak satu kali.
3. Item diurutkan `propertyId` ascending agar response deterministik.
4. `propertyId` wajib UUID property yang sama dengan scope backend.
5. `enabled` wajib boolean non-null.
6. Row `property_feature_flags` yang tidak ada diserialisasi explicit `enabled: false`.
7. Duplicate, missing field, tipe malformed, atau property mismatch diperlakukan fail-closed oleh client.
8. Carrier hanya memuat `adminUxRead`.
9. Carrier tidak memuat `leaseWrite`, `leaseTransfer`, `leaseBillingScheduler`, metric Dashboard, property name, atau PII.
10. Tidak dibuat alias `property_rollouts`, `property_id`, atau `admin_ux_read` pada auth response.

Casing Dashboard snake_case tidak diterapkan otomatis pada AuthMe karena carrier mengikuti compatibility surface auth existing.

## 4. Response ownership dan compatibility AuthMe

Keputusan baru:

- Existing field `/auth/me` tidak dihapus, diganti nama, atau diubah tipe.
- `propertyRollouts` bersifat additive dan camelCase.
- `/auth/me` adalah authority carrier, bukan object `user` pada response login atau refresh.
- Flow login dan bootstrap tetap mengambil `/auth/me` setelah memperoleh access token.
- Access-token JWT tidak membawa rollout flag.
- Token refresh tanpa `/auth/me` bukan refresh carrier.
- `GET /properties` dan `GET /dashboard/summary` tidak menjadi carrier rollout.
- Frontend kelak menghubungkan `propertyRollouts[].propertyId` dengan UUID yang sama pada `currentPropertyId` dan compatibility property scope existing.

Keputusan untuk tidak menaruh flag dalam JWT menjaga kill switch tidak bergantung pada token expiry. Keputusan ini tidak mengubah role, permission, atau session claim existing.

## 5. Owner-global enumeration

### 5.1 Fakta

Owner global dapat memiliki `propertyIds: []` karena assignment global menggunakan `property_id = NULL`. Karena itu, memetakan rollout hanya dari `UserAccessContext.propertyIds` akan menghasilkan carrier owner yang salah.

### 5.2 Opsi yang dinilai

| Opsi | Semantics                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------- |
| 1    | Owner hanya menerima explicit assigned properties; owner global dapat memperoleh array kosong.                        |
| 2    | Owner global menerima seluruh property aktif; manager/admin menerima effective server-side authorized property scope. |
| 3    | Owner global menerima seluruh property termasuk inactive.                                                             |

### 5.3 Keputusan baru

M7-D2B1A memilih **opsi 2**:

- owner global menerima tepat satu rollout item untuk setiap property aktif;
- manager/admin menerima hanya effective server-side authorized property scope yang dihitung backend;
- query access context existing memfilter `user_property_roles.revoked_at IS NULL`, tetapi amendment ini tidak memperluas semantics assignment di luar evidence tersebut;
- property scope tidak diterima dari input client;
- hasil dideduplikasi berdasarkan property UUID;
- hasil diurutkan `propertyId ASC`; dan
- carrier tidak memberikan role, permission, atau scope baru.

Carrier tidak boleh mengungkap existence maupun flag property di luar hasil enumeration tersebut.

## 6. Property inactive

### 6.1 Opsi yang dinilai

| Opsi | Semantics                                                         |
| ---- | ----------------------------------------------------------------- |
| 1    | Sertakan property inactive dengan `enabled: false`.               |
| 2    | Omit property inactive dari carrier.                              |
| 3    | Sertakan property inactive dengan nilai flag database apa adanya. |

### 6.2 Keputusan baru

M7-D2B1A memilih **opsi 2**:

- property inactive tidak masuk `propertyRollouts`;
- omission berlaku untuk owner global dan actor scoped;
- row flag true tidak membuat property inactive muncul;
- carrier tidak mengubah nilai flag database secara implicit; dan
- setelah property direaktivasi, frontend harus memperoleh `/auth/me` baru sebelum Dashboard dapat dievaluasi.

Keputusan ini bersifat fail-closed dan mencegah property non-operasional dipilih untuk Dashboard canonical.

## 7. RBAC dan fail-closed boundary

Carrier bukan permission grant. Dashboard canonical tetap memerlukan seluruh kondisi berikut:

1. role salah satu `owner`, `manager`, atau `admin`;
2. seluruh permission `room.read`, `lease.read`, dan `billing.read`;
3. property berada dalam server-authorized scope;
4. `propertyRollouts` memiliki item dengan `propertyId` yang sama dengan `currentPropertyId`; dan
5. `adminUxRead.enabled` bernilai true.

Semantics fail-closed:

- carrier array missing atau malformed → Dashboard disabled;
- item missing, duplicate, malformed, atau property mismatch → property tersebut disabled;
- `enabled` missing, null, atau bukan boolean → disabled;
- carrier query/fetch/parse failure → Dashboard disabled;
- row DB absent → response explicit false;
- 401 tetap mengikuti auth failure lifecycle; dan
- 403 dari endpoint Dashboard yang sudah dilakukan tetap forbidden, bukan feature-disabled.

Disabled tidak boleh memicu direct cutover, fallback `useReports`, fan-out list, reuse stale snapshot, proxy metric, atau angka sintetis.

## 8. Freshness dan rollback SLA

### 8.1 Fakta

Boot dan login sudah mengambil `/auth/me`. Property switch, token refresh, dan active session belum memiliki bounded carrier refresh atau rollback detection.

### 8.2 Opsi yang dinilai

| Opsi | Semantics                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| 1    | Refresh hanya pada boot, login, dan property switch; tidak ada bounded active-session rollback SLA.        |
| 2    | Tambahkan mandatory refresh pada property switch, visible polling, dan immediate focus/visibility refresh. |
| 3    | Gunakan push-only WebSocket/SSE, tetapi belum ada transport berotoritas.                                   |

### 8.3 Keputusan baru

M7-D2B1A memilih **opsi 2**:

1. Boot dan login tetap wajib mengambil `/auth/me` setelah token tersedia.
2. Property switch wajib me-refresh `/auth/me` sebelum Dashboard property target boleh mount.
3. Kegagalan refresh pada property switch membuat Dashboard target disabled.
4. Selama document visible dan session authenticated, frontend me-refresh `/auth/me` setiap **60 detik**.
5. Frontend me-refresh `/auth/me` segera saat window/document kembali focus atau visible.
6. Kill-switch SLA adalah maksimal 60 detik selama document visible, atau segera pada focus/visibility/property switch.
7. Token refresh tanpa `/auth/me` tidak memperbarui carrier.
8. Refresh request carrier tidak boleh berjalan paralel tanpa batas; implementasi harus menggunakan single-flight atau equivalent dedupe.

Angka 60 detik adalah keputusan operasional baru, bukan evidence existing.

### 8.4 Transition disable dan re-enable

Saat carrier berubah true menjadi false, frontend wajib:

1. membatalkan request Dashboard property tersebut yang masih berjalan;
2. menghapus exact cache `[dashboard, summary, propertyId]`;
3. tidak merender snapshot yang tersimpan sebelumnya; dan
4. menampilkan feature-disabled state.

Saat carrier berubah false menjadi true, frontend wajib:

1. menerima `/auth/me` baru yang valid;
2. mengevaluasi kembali RBAC dan property scope;
3. mengambil snapshot Dashboard baru; dan
4. tidak langsung merender snapshot pre-disable.

Network, server, atau parse failure saat refresh carrier bersifat fail-closed untuk Dashboard dan tidak memicu fallback legacy.

## 9. Authority operator dan audit

### 9.1 Fakta

Discovery tidak menemukan controller, service, atau runbook runtime yang mengubah `property_feature_flags` untuk canary. Belum ada authority tertulis yang memberi product role akses toggle rollout.

### 9.2 Opsi yang dinilai

| Opsi | Semantics                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------- |
| 1    | Owner/manager/admin dapat toggle dari product UI.                                                  |
| 2    | Operator mengubah flag melalui ad-hoc SQL.                                                         |
| 3    | Controlled release/platform operator workflow di luar product UI dengan approval dan audit atomik. |

### 9.3 Keputusan baru

M7-D2B1A memilih **opsi 3**:

- hanya release/platform operator yang ditunjuk dalam change ticket dapat enable atau disable;
- product role `owner`, `manager`, dan `admin` tidak otomatis memiliki authority toggle;
- tidak dibuat public Admin UI atau endpoint Dashboard kedua;
- operasi kelak harus memakai controlled backend operational command/runbook, bukan ad-hoc SQL;
- input operasi wajib memuat property UUID, target boolean, reason, change-ticket/reference, operator identity, dan expected current value atau version;
- property wajib ada dan aktif untuk enable;
- upsert flag dan insert audit harus satu transaction;
- stale expected value/version menghasilkan conflict dan tidak mengubah flag;
- tidak ada silent last-write-wins; dan
- kegagalan audit membatalkan perubahan flag.

Audit wajib menyimpan:

- property UUID;
- before dan after `admin_ux_read`;
- actor/operator identity;
- reason;
- change-ticket/reference;
- timestamp;
- result status;
- correlation ID; dan
- tanpa PII atau metric Dashboard.

Enable memerlukan approval release owner yang tercatat pada change ticket. Rollback ke false boleh dijalankan sebagai kill switch oleh on-call release operator dan tetap wajib diaudit.

Exact nama command, audit storage, dan version mechanism tetap work item implementasi setelah contract. Authority dan invariant di atas telah dibekukan oleh D2B1A.

## 10. Migration, seed, JWT, dan endpoint boundary

Keputusan normatif:

- tidak ada migration baru untuk carrier;
- tidak ada production/core/demo seed yang meng-enable `admin_ux_read`;
- fixture disposable boleh membuat row explicit untuk test, tetapi tidak menjadi rollout production;
- flag tidak masuk access-token JWT claim;
- tidak dibuat endpoint rollout Dashboard kedua;
- `/api/v1/auth/me` tetap carrier tunggal;
- tidak ada direct cutover;
- tidak ada fallback `useReports`; dan
- tidak ada source patch sampai handoff dan gate berikutnya disetujui.

## 11. Handoff setelah D2B1A

M7-D2B1A hanya membuka perencanaan work item terpisah berikut:

1. Backend IAM/auth carrier query, response type, serializer, dan focused no-database contract test.
2. Controlled operator command/runbook, atomic audit, approval, dan concurrency guard.
3. Shared `AuthMe` type serta frontend auth/property refresh lifecycle setelah backend carrier tersedia.
4. Dashboard frontend canonical setelah carrier implementation dan rollback evidence tersedia.

Candidate implementation files dicatat untuk handoff, bukan diotorisasi pada amendment ini:

- `backend/api/src/modules/iam/repositories/iam.repository.ts`
- `backend/api/src/modules/auth/types/auth-response.types.ts`
- `backend/api/src/modules/auth/auth.service.ts`
- `backend/api/test/admin-ux-m7/dashboard-rollout-carrier-contract.spec.ts`
- `packages/domain/src/auth.ts`
- `apps/admin/src/lib/auth/AuthProvider.tsx`
- `apps/admin/src/lib/property/PropertyProvider.tsx`

`auth.controller.ts` tidak memerlukan endpoint baru. M6 `LeaseFeatureService` dan consumers existing tidak diubah oleh carrier work item.

## 12. Acceptance gate docs-only

M7-D2B1A selesai sebagai amendment docs-only bila:

1. fakta discovery dipisahkan jelas dari keputusan baru;
2. `/api/v1/auth/me` ditetapkan sebagai satu-satunya carrier terautentikasi;
3. exact wire `propertyRollouts[].propertyId` dan `propertyRollouts[].adminUxRead.enabled` dibekukan;
4. array, ordering, duplicate, absent-row, missing, malformed, dan property-mismatch semantics dibekukan;
5. carrier dibatasi hanya pada `adminUxRead`;
6. owner-global enumeration seluruh property aktif dibekukan;
7. manager/admin dibatasi pada effective server-side authorized property scope;
8. property inactive diomit;
9. RBAC dan fail-closed/no-fallback boundary dipertahankan;
10. refresh lifecycle, visible polling 60 detik, immediate focus/switch refresh, serta rollback SLA dibekukan;
11. disable/re-enable cache behavior dibekukan;
12. controlled release operator authority, approval, audit atomik, dan concurrency guard dibekukan;
13. migration dan seed enable dinyatakan tidak diperlukan;
14. JWT flag claim, endpoint Dashboard kedua, direct cutover, dan source/test patch dilarang; dan
15. hanya verifikasi docs-only yang mendapat approval terpisah yang boleh dijalankan.

Setelah approval terpisah pada tahap eksekusi docs-only, verifikasi yang diizinkan hanya:

- Prettier terhadap file M7-D2B1A baru; dan
- `git diff --check` yang di-scope ke file M7-D2B1A.

Tidak ada test, lint/build source, database task, staging, commit, atau push pada amendment M7-D2B1A.
