# Admin UX M7-B0 — Kontrak Payment Gateway Admin Read-Only

> **Status:** Kontrak dokumentasi normatif M7-B0; belum mengizinkan patch kode.
>
> **Authority utama M7:** `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §1, §2 DEC-12 dan DEC-15, §4 baris “M7 — Integrasi modul & dashboard”, serta §5 ownership dan batas file.
>
> **Authority pendukung terbatas:** `docs/15c-payment-gateway/BACKEND_PAYMENT_GATEWAY_FOUNDATION.md` §4 dan §9; `docs/15c-payment-gateway/FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_IMPLEMENTATION.md` §3, §4, dan §7.

## 1. Scope dan non-goals

M7-B0 membekukan hanya kontrak payment gateway Admin read-only untuk daftar dan detail transaksi. Authority pendukung tidak menggantikan authority utama M7 dan tidak berlaku di luar slice ini.

Kode produk, implementasi API/UI, test, migration, seed, mutation payment, M6, M8, CSV, route generated, serta perubahan kontrak domain M7 lain berada di luar scope.

## 2. Registry kontrak dan endpoint

| Item                                           | Status                  | Kontrak authoritative                                                                                                                        | Referensi authority                                                                                                                                                          |
| ---------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment gateway Admin transaction read-only    | `EXISTING AUTHORITY`    | Admin membaca daftar dan detail transaksi gateway dengan field provider-neutral yang telah dinormalisasi.                                    | `docs/15c-payment-gateway/BACKEND_PAYMENT_GATEWAY_FOUNDATION.md` §4 dan §9; `docs/15c-payment-gateway/FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_IMPLEMENTATION.md` §3, §4, dan §7 |
| Daftar transaksi                               | `EXISTING AUTHORITY`    | `GET /api/v1/admin/payment-transactions`                                                                                                     | `docs/15c-payment-gateway/BACKEND_PAYMENT_GATEWAY_FOUNDATION.md` §4; `docs/15c-payment-gateway/FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_IMPLEMENTATION.md` §3 dan §4             |
| Detail transaksi                               | `EXISTING AUTHORITY`    | `GET /api/v1/admin/payment-transactions/:id`                                                                                                 | `docs/15c-payment-gateway/BACKEND_PAYMENT_GATEWAY_FOUNDATION.md` §4; `docs/15c-payment-gateway/FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_IMPLEMENTATION.md` §3 dan §4             |
| Property scope server-side pada kedua endpoint | `NEW CONTRACT REQUIRED` | Frontend terdokumentasi mengasumsikan server-side scoping, tetapi enforcement property dan role belum dikonfirmasi oleh authority pendukung. | `docs/15c-payment-gateway/FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_IMPLEMENTATION.md` §4                                                                                         |

DEC-15 mengatur bentuk wire dan kompatibilitas, tetapi tidak memberikan authority untuk endpoint payment lain. Endpoint di luar dua GET di atas tetap tidak berotoritas untuk M7-B0.

## 3. Batas keamanan dan perilaku

1. Integrasi bersifat read-only. Tidak ada authority untuk create, update, verify, reject, settle, refresh-provider, refund, delete, atau mutation lain.
2. UI, state, cache, log, dan artifact dilarang menerima atau merender raw provider payload, raw error body, signature, server key, client key, webhook secret, Basic auth value, atau metadata blob.
3. Hanya field provider-neutral yang telah dinormalisasi boleh digunakan. Field tambahan tidak boleh diinfer dari metadata provider.
4. Property scope wajib fail-closed. Kedua endpoint belum boleh dipakai oleh kode M7 sampai kontrak server-side property scope dan enforcement role disetujui.
5. Batas PII dan property access tetap mengikuti `docs/plans/ADMIN_UX_FINAL_INTEGRATION.md` §2 DEC-12. Frontend guard hanya UX; backend tetap policy enforcement point.

## 4. Open decision sebelum patch kode

Sebelum kode M7 memakai slice ini, owner Backend/API, Frontend Integrasi, dan Integrator wajib menyetujui kontrak property scope server-side untuk:

- `GET /api/v1/admin/payment-transactions`;
- `GET /api/v1/admin/payment-transactions/:id`.

Keputusan wajib menetapkan enforcement role dan properti, perilaku denial, serta memastikan transaksi dari properti yang tidak berhak tidak masuk response atau cache. Sampai keputusan tersebut disetujui, property scope server-side tetap `NEW CONTRACT REQUIRED` dan patch kode M7 untuk slice ini diblokir.
