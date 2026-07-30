# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pengguna utama adalah `owner`, `manager`, dan `admin` yang menjalankan operasi harian properti melalui aplikasi Admin: memantau inventori kamar, menindaklanjuti calon penghuni, mengelola penyewaan dan hunian, serta membaca kondisi billing dan operasional.

Pengguna sekunder adalah Penghuni yang mengakses layanan mandiri dan calon penghuni yang menjelajahi katalog publik serta menyampaikan minat booking. Istilah produk yang canonical adalah “Penghuni”, bukan “tenant”, kecuali pada nama teknis atau URL legacy yang belum dapat diubah.

## Product Purpose

KOSTATION menyatukan fakta operasional hunian agar setiap perubahan lifecycle memiliki sumber data, authority, dan jejak yang jelas. Produk membantu operator nonteknis memahami kondisi properti saat ini, mengambil tindakan yang diizinkan, dan berpindah dari satu tahap operasional ke tahap berikutnya tanpa menyatukan konsep domain yang berbeda.

Keberhasilan berarti data kamar, calon penghuni, penyewaan, hunian, billing, pembayaran, komplain, dan maintenance tetap konsisten dalam scope properti yang benar serta dapat dipahami tanpa membaca detail teknis internal.

Perencanaan pasca-M19 untuk perombakan fungsional menyeluruh berada di
[`docs/21-kost-management-ecosystem-overhaul/`](docs/21-kost-management-ecosystem-overhaul/README.md).
Paket tersebut berstatus **approved planning, not implemented** dan menjadi
authority target untuk Admin, katalog publik, aplikasi Penghuni, serta akses
investor `property_owner`. Keberadaan dokumen itu tidak mengubah evidence shipped
yang dicatat di bawah.

## Positioning

KOSTATION adalah sumber data operasional terpadu untuk lifecycle:

calon penghuni → Booking Lead/minat booking → hold kamar → lease/penyewaan → move-in → billing/payment → complaint/maintenance → move-out.

Setiap tahap mempunyai authority sendiri. Booking Lead adalah catatan minat, bukan reservasi. Hold kamar bukan lease/penyewaan atau occupancy/penghuni aktif. Move-in mengaktifkan occupancy melalui command lifecycle yang berwenang, sedangkan status kamar tidak boleh diubah sebagai efek samping quick entry atau UI lokal.

## Operating Context

- Admin dan Penghuni adalah aplikasi web terpisah dalam satu monorepo, dengan API bersama sebagai authority backend.
- Admin dipakai sebagai pusat kendali kerja harian lintas inventori, penghuni, penyewaan, billing, minat booking, notifikasi, dan operasi properti lain sesuai role, permission, rollout, serta property scope.
- Penghuni memakai pengalaman mobile-first untuk home, tagihan, komplain, notifikasi, profil, informasi, dan komunikasi yang tersedia.
- Calon penghuni dapat membuka katalog `/kamar` tanpa login. Data publik harus tetap agregat dan aman; nomor kamar exact, opaque ID, occupancy, billing, serta PII tidak menjadi data katalog publik.
- PostgreSQL adalah system of record. Redis mendukung kebutuhan runtime seperti cache, rate limiting, dan queue; backend tetap authority untuk policy dan mutation.

## Capabilities and Constraints

Repository mempunyai implementasi dan kontrak untuk inventori kamar serta referensi building, minat booking Admin dan publik, room hold, penyewaan, occupancy/move-in/move-out, billing dan payment read flows, payment gateway read-only, komplain/work order, kendaraan, notifikasi, serta katalog publik. Ketersediaan suatu route tidak dengan sendirinya membuktikan seluruh lifecycle atau deployment siap dipakai.

Role yang dikenali source adalah `owner`, `manager`, `admin`, `technician`, `resident`, dan `property_owner`. Backend wajib menegakkan RBAC, permission, user/property membership, persisted property ownership, serta rollout flag. Frontend guard hanya membantu pengalaman pengguna dan tidak boleh menjadi authority keamanan.

Mutation lifecycle harus fail-closed. Feature atau rollout yang absent, null, invalid, atau disabled tidak boleh dianggap aktif. Scope properti kosong tidak boleh berubah menjadi query global. Opaque identifier, credential, token, raw provider material, storage path, dan PII yang tidak diperlukan tidak boleh masuk UI, log, audit, outbox, atau response publik.

Integrasi Smart Lock/CCTV/provider eksternal bersifat conditional dan tidak boleh dianggap live hanya karena route atau adapter tersedia. Aktivasi production, readiness integrasi, credential, pricing, customer proof, dan compliance certification belum menjadi fakta produk yang dikonfirmasi.

M13 canonical move-in/out, M14 room hold, dan M15 room persistence telah shipped dan automated verified. Runtime mutation evidence untuk lifecycle M13 serta create/edit kamar M15 masih deferred karena keterbatasan environment launcher, bukan defect produk yang telah dibuktikan.

M16 maintenance dispatch, M17 persistent property Settings, dan M18 resident identity/self-context telah shipped dan automated verified. Authenticated runtime evidence untuk ketiganya masih deferred sampai credential proses-only tersedia. M19 adalah milestone closure/evidence untuk recovery ini, bukan kapabilitas produk baru. Nama milestone, komentar source, atau dokumen rencana saja tetap bukan bukti shipped maupun production readiness.

## Brand Commitments

KOSTATION harus terasa jelas bagi pengguna nonteknis, konsisten dalam istilah, tegas terhadap boundary lifecycle, dan tenang saat menyajikan operasi yang padat. Bahasa Indonesia digunakan untuk istilah operasional yang terlihat oleh pengguna. Copy harus menjelaskan konsekuensi tindakan, terutama ketika sebuah tindakan belum menjadi booking, reservasi, occupancy, pembayaran, atau penyewaan resmi.

Privasi dan isolasi properti adalah bagian dari janji produk, bukan detail implementasi. UI tidak boleh mengekspos opaque ID atau material internal untuk membantu pengguna “memahami” suatu record.

## Evidence on Hand

- Struktur aplikasi dapat ditelusuri di `apps/admin/src/`, `apps/penghuni/src/`, `backend/api/src/`, dan `packages/domain/src/`.
- Authority metadata route Admin berada di `apps/admin/src/lib/admin-route-registry.ts`; backend policy tetap berada di `backend/api/src/`.
- Istilah “Penghuni”, role, dan status inti dibakukan di `packages/domain/src/enums.ts` dan bentuk auth bersama berada di `packages/domain/src/auth.ts`.
- Evidence recovery M9–M12 berada di `packages/admin-ux-qa/scripts/m9-runtime-topology.spec.ts`, `packages/admin-ux-qa/scripts/verify-read-only-recovery.ts`, `apps/admin/src/lib/m10-rooms-inventory.test.ts`, dan `apps/admin/src/lib/m11-booking-quick-entry.test.ts`.
- Kontrak canonical move-in, room hold, dan persistence kamar berada di `apps/admin/src/lib/m13-canonical-move-in-out.test.ts`, `apps/admin/src/lib/m14-booking-lead-room-hold.test.ts`, `apps/admin/src/lib/m15-room-persistence.test.ts`, serta pasangan backend di `backend/api/test/admin-ux-m13/`, `backend/api/test/admin-ux-m14/`, dan `backend/api/test/admin-ux-m15/`.
- Evidence M16–M18 berada di `apps/admin/src/lib/m16-maintenance-dispatch.test.ts`, `apps/admin/src/lib/m17-settings.test.ts`, `apps/penghuni/src/lib/m18-resident-self-context.test.ts`, serta pasangan backend di `backend/api/test/admin-ux-m16/`, `backend/api/test/admin-ux-m17/`, dan `backend/api/test/admin-ux-m18/`.
- Truth matrix recovery/revision M9–M19, batas runtime, dan deferred evidence dicatat di `.claude/LOCAL_CHECKPOINT.md`.
- Batas readiness dan absence of production claims dicatat di `docs/00-project/PROJECT_HANDOFF.md`, `docs/00-project/PROJECT_MASTER.md`, dan indeks `docs/README.md`; dokumen ini tidak menambahkan klaim customer, testimonial, pricing, deployment production, integration readiness production, atau compliance certification.

## Product Principles

1. **Satu fakta operasional, satu authority.** Backend dan database menentukan state domain; UI tidak mengarang state atau total.
2. **Lifecycle tidak boleh disingkat.** Minat, hold, penyewaan, occupancy, billing, dan pembayaran adalah tahap berbeda dengan command berbeda.
3. **Property isolation selalu fail-closed.** Authority, query, cache, response, dan mutation wajib membawa scope yang dapat dibuktikan.
4. **Jelas bagi operator nonteknis.** Gunakan istilah Indonesia yang konsisten, konsekuensi tindakan yang eksplisit, dan state yang mudah dipindai.
5. **Privasi secara default.** Tampilkan hanya data yang dibutuhkan untuk pekerjaan saat itu dan simpan material internal di luar UI serta evidence.

## Accessibility & Inclusion

Pengalaman harus dapat dipakai dengan keyboard, pembaca layar, serta viewport mobile dan desktop. Kontrol memerlukan label yang dapat dipahami, focus state yang terlihat, error inline yang terkait dengan field, dan focus management pada dialog atau sheet.

Status tidak boleh disampaikan melalui warna saja. Teks, ikon, atau cue eksplisit harus mendampingi warna. Layout harus reflow tanpa horizontal page overflow, target interaksi harus tetap dapat dijangkau, dan bahasa operasional harus menghindari jargon teknis yang tidak diperlukan.
