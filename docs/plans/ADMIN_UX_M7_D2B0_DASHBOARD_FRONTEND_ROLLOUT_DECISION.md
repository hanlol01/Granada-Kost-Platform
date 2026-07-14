# Admin UX M7-D2B0 — Keputusan Rollout Dashboard Frontend

> **Status:** Amendment dokumentasi normatif M7-D2B0 untuk authority rollout Dashboard canonical; tidak mengizinkan patch source atau test.
>
> **Authority utama:** `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §2 DEC-18, `docs/plans/ADMIN_UX_M7_D0_DASHBOARD_SUMMARY_CONTRACT.md`, dan `docs/plans/ADMIN_UX_M7_D1_DASHBOARD_CORE_SUMMARY_DECISION.md`.
>
> **Keputusan:** Dashboard canonical menggunakan rollout flag backend per property. Direct cutover tanpa flag per property tidak diotorisasi.

## 1. Scope dan hierarchy authority

M7-D2B0 menutup blocker authority rollout frontend untuk Dashboard canonical. M7-D1 mewajibkan cutover di bawah read rollout flag per property, sedangkan discovery frontend menemukan bahwa auth/property scope saat ini belum membawa flag tersebut dan feature evaluator existing hanya menyediakan flag berbasis environment.

Amendment ini:

1. menetapkan sumber, tipe, identity, semantics enable/disable, rollback, property scope, dan failure behavior rollout flag Dashboard;
2. mempertahankan DEC-18 bahwa rollout read bersifat backend-controlled dan property-scoped;
3. tidak mengubah kontrak metric, response, query, RBAC, atau PII M7-D0/M7-D1;
4. tidak mengizinkan direct cutover global maupun fallback client aggregation; dan
5. tidak membuat source, test, endpoint, migration, seed, feature flag environment, atau perubahan database.

Jika terdapat perbedaan, hierarchy authority tetap:

1. `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md`, khususnya DEC-18;
2. amendment M7-D2B0 ini untuk authority rollout Dashboard frontend;
3. M7-D1 untuk response dan semantics Dashboard Core v1;
4. M7-D0 untuk endpoint canonical dan invariant yang tidak diamend; dan
5. implementasi existing hanya menjadi evidence kondisi saat ini, bukan authority baru.

## 2. Sumber flag canonical

Satu-satunya sumber kebenaran rollout Dashboard adalah backend property-scoped rollout state yang sama dengan kontrak DEC-18 `admin_ux_read`.

Flag harus disediakan kepada frontend sebagai capability rollout read-only yang:

- berasal dari backend terautentikasi;
- terikat pada satu property yang berada dalam auth/property scope actor;
- menggunakan property UUID yang sama dengan `currentPropertyId` dan query Dashboard;
- dapat diperbarui melalui lifecycle auth/bootstrap atau refresh scope property; dan
- bukan endpoint Dashboard kedua atau sumber metric tambahan.

Frontend dilarang menggunakan salah satu dari berikut sebagai pengganti authority flag:

- environment variable atau build-time flag Dashboard;
- local storage atau session storage;
- query parameter atau route state;
- role atau permission;
- jumlah property actor;
- keberhasilan atau kegagalan request Dashboard;
- keberadaan cache Dashboard; atau
- fallback ke implementasi legacy `useReports`.

Exact carrier, endpoint, dan payload bootstrap/auth property scope harus dibekukan dalam work item kontrak berikutnya sebelum implementasi source. D2B0 tidak mengarang bentuk tersebut.

## 3. Tipe dan identity

Flag memiliki tipe boolean non-null per property:

```text
property_id: UUID
admin_ux_read.enabled: true | false
```

Semantics tipe:

- `true` berarti rollout read Dashboard canonical diizinkan untuk property tersebut, dengan seluruh RBAC dan scope check tetap berlaku;
- `false` berarti surface Dashboard canonical dinonaktifkan untuk property tersebut;
- field missing, nilai unknown, payload malformed, identity property tidak cocok, atau state belum ter-resolve diperlakukan sebagai `false`;
- tidak ada `null`, tri-state yang dianggap enabled, default true, wildcard, inheritance global, atau aggregate multi-property; dan
- satu property tidak dapat mewarisi flag dari property lain yang dimiliki actor yang sama.

Flag adalah rollout control, bukan business permission dan bukan grant RBAC.

## 4. Semantics enable

Dashboard canonical hanya boleh mount dan menjalankan query bila semua kondisi berikut terpenuhi:

1. flag `admin_ux_read.enabled` untuk `currentPropertyId` bernilai `true`;
2. actor memiliki salah satu role `owner`, `manager`, atau `admin`;
3. actor memiliki seluruh permission `room.read`, `lease.read`, dan `billing.read`;
4. property berada dalam scope actor; dan
5. auth, property selection, dan flag property target telah selesai di-resolve.

Flag enabled:

- tidak memberikan role atau permission;
- tidak melewati backend authorization;
- tidak mengizinkan aggregate lintas property;
- tidak mengubah query key property-scoped; dan
- hanya mengizinkan satu sumber canonical: `GET /dashboard/summary?property_id=<currentPropertyId>`.

Setelah enabled, Dashboard tidak boleh memanggil, mencampur, atau fallback ke `useReports`, list room, resident, invoice, payment, complaint, vehicle, parking, maupun work-order untuk metric canonical.

## 5. Semantics disable, missing, dan unresolved

Kondisi berikut diperlakukan disabled:

- flag explicit `false`;
- flag missing;
- payload flag malformed;
- identity property pada flag tidak cocok dengan `currentPropertyId`;
- flag belum selesai di-resolve;
- refresh flag gagal; atau
- state flag menjadi stale dan tidak dapat dikaitkan dengan property aktif.

Saat disabled:

1. hook/query Dashboard canonical tidak boleh mount atau melakukan request;
2. UI menampilkan state feature-disabled yang aman dan tidak menampilkan snapshot sebelumnya;
3. tidak ada fallback ke `useReports` atau fan-out endpoint list;
4. tidak ada placeholder metric, proxy metric, angka nol sintetis, maupun metric inferred;
5. cache property lain tidak boleh dirender; dan
6. route Reports tetap terpisah dan tetap dapat memakai `useReports` sesuai authority Reports existing.

Disabled bukan `403`. Ia adalah rollout state sebelum request canonical. Jika backend Dashboard sudah menerima request dan mengembalikan `403`, frontend harus menampilkan forbidden state dan tidak menyamarkannya sebagai feature-disabled.

## 6. Property switch dan cache boundary

Pada perpindahan property A ke property B, client wajib:

1. membatalkan request property A yang masih berjalan;
2. menghapus atau menonaktifkan penggunaan cache property A;
3. me-remount boundary data berdasarkan property B;
4. me-resolve flag property B sebelum query Dashboard B mount; dan
5. memakai query key `[dashboard, summary, propertyId]` untuk property target.

Invariant:

- flag property A tidak pernah mengaktifkan property B;
- cache Dashboard A tidak boleh tampil sementara flag B unresolved, disabled, atau denied;
- respons request A yang selesai terlambat tidak boleh mengisi cache atau UI B; dan
- perubahan property tidak boleh memicu fallback aggregation legacy.

Mekanisme cancel/remove cache dan keyed remount existing boleh digunakan kembali, tetapi tidak menggantikan evaluasi flag property target.

## 7. Rollback dan kill switch

Rollback Dashboard canonical dilakukan dengan mengubah flag backend property target dari `true` menjadi `false`. Rollback:

- tidak memerlukan deployment frontend;
- berlaku hanya pada property target;
- tidak mengubah role atau permission actor;
- tidak memengaruhi route Reports; dan
- tidak mengembalikan Dashboard ke client aggregation legacy.

Saat client menerima transition enabled ke disabled, client wajib:

1. menghentikan atau membatalkan query Dashboard property tersebut;
2. menghapus cache canonical Dashboard untuk property tersebut;
3. tidak merender snapshot yang tersimpan sebelumnya; dan
4. menampilkan feature-disabled state.

Saat re-enable:

- client wajib melakukan fetch snapshot canonical baru;
- cache sebelum disable tidak boleh langsung dirender sebagai snapshot aktif; dan
- seluruh RBAC, permission, property scope, parser whitelist, serta state boundary tetap dievaluasi ulang.

Rollback tidak mengubah endpoint, response M7-D1, atau data backend.

## 8. Freshness dan failure semantics flag

Flag dievaluasi paling sedikit pada:

- bootstrap/authenticated scope load;
- refresh auth/property scope yang berotoritas; dan
- pergantian `currentPropertyId`.

Failure behavior bersifat fail-closed:

- network/server/parse failure saat memuat flag menghasilkan disabled state yang dapat dibedakan dari forbidden;
- payload malformed tidak boleh dianggap enabled;
- 401 mengikuti auth lifecycle existing;
- 403 dari request Dashboard yang sudah dilakukan tetap forbidden dan tidak diubah menjadi feature-disabled; dan
- error flag tidak boleh memicu request canonical, fallback list, atau reuse snapshot stale.

D2B0 tidak menetapkan polling interval, TTL, propagation SLA, atau cache duration flag. Work item implementasi berikutnya wajib membekukan refresh policy dan menyediakan evidence propagation/rollback sebelum canary production.

## 9. Recent item authority tidak berubah

M7-D2B0 tidak mengubah kontrak recent items M7-D1:

- `recent_leases` mencakup seluruh status yang dikirim backend sesuai query M7-D1;
- `recent_payments` mencakup seluruh status yang dikirim backend sesuai query M7-D1;
- frontend parser hanya memvalidasi status sebagai non-empty safe string dan menyalinnya dalam response whitelist;
- frontend tidak membuat enum atau allowlist status baru;
- frontend tidak membuang item hanya karena status baru atau tidak dikenal;
- frontend tidak menginfer, memetakan ulang, atau mengganti status; dan
- status tidak boleh digunakan untuk memperluas field PII atau raw payload yang di-cache/render.

`verified_revenue_current_month` dan `urgent_maintenance_count` tetap deferred dan sepenuhnya absen. Rollout flag tidak mengotorisasi kedua metric tersebut.

## 10. Handoff dan gate sebelum M7-D2B

Sebelum patch source frontend Dashboard canonical dimulai, work item kontrak berikutnya wajib:

1. membekukan exact carrier dan schema flag pada bootstrap/auth property scope;
2. menetapkan ownership backend/auth, frontend foundation, frontend integration, dan QA;
3. menyediakan implementasi backend atau source berotoritas yang memberi boolean per property;
4. menetapkan refresh/freshness dan propagation behavior;
5. membuktikan default/missing/malformed flag fail-closed;
6. membuktikan satu dari dua property dapat enabled tanpa mengaktifkan property lain;
7. membuktikan disable/rollback saat request Dashboard masih in-flight membatalkan request dan membersihkan cache;
8. membuktikan property switch tidak merender stale snapshot;
9. membuktikan RBAC backend tetap authoritative; dan
10. membuktikan tidak ada fallback atau fan-out ke `useReports` dan endpoint list Dashboard.

Sesudah gate tersebut dipenuhi, M7-D2B dapat merencanakan kembali parser whitelist, hook query canonical, route access capability, loading/empty/error/retry/forbidden/property-switch states, recent item rendering, dan static/runtime tests.

## 11. Batas eksplisit

M7-D2B0 tidak:

- mengubah source atau test apa pun;
- membuat env flag atau feature evaluator frontend;
- mengubah `AuthMe`, `PropertyScopeRef`, endpoint auth/property, backend Dashboard, atau database;
- mengotorisasi direct cutover tanpa flag per property;
- mengubah `useReports`, Dashboard route, query key, route generated, M6, M8, CSV, atau payment gateway;
- menambah enum atau allowlist status recent lease/payment;
- mengubah metric Core v1 maupun metric deferred; atau
- mengizinkan staging, commit, push, migration, seed, atau task database sebagai bagian amendment ini.
