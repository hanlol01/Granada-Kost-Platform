# Backlog

> Update 2026-07-03 (M12F): item yang telah selesai ditandai "Selesai" dan tidak lagi dianggap backlog aktif. Item File API yang dulu bergantung pada "File Module belum ada" telah diselesaikan oleh M12C1 (lihat TD-004).

## Foundation

- Scaffold NestJS backend di `backend/api`. (Selesai - Milestone 2.)
- Tambahkan env schema bersama untuk backend dan frontend. (Selesai - env validation backend + `packages/domain` env schema frontend.)
- Tambahkan CI lint/build untuk workspaces. (Masih terbuka.)
- Audit dependensi duplicate antara Admin dan Penghuni. (Masih terbuka.)

## Product

- Definisikan modul Penghuni, kamar, tagihan, pembayaran, smart lock, CCTV, komplain, dan notifikasi. (Selesai untuk cakupan Phase 1; CCTV live dan smart lock live masih deferred.)
- Susun kontrak API awal di `packages/domain`. (Selesai - M11B.)
- Buat typed API client di `packages/api-client`. (Selesai - M11B, frozen.)

## File & Upload (M12) - Status dan Tindak Lanjut

Selesai (keluar dari backlog aktif): Backend File API Foundation (M12C1), Generic Frontend Upload Engine (M12C2), Penghuni Manual Payment Proof Upload (M12C3), Complaint Attachment Backend Readiness (M12C4), Admin File Preview/Review (M12C5), Penghuni Complaint Create UI + Attachment (M12D).

Tindak lanjut (backlog aktif, jangan ditandai selesai):

- Penghuni complaint detail dengan thumbnail lampiran (endpoint file resident-facing untuk komplain belum diekspos).
- Otomasi cleanup file via cron menggantikan `npm run file:cleanup` manual + monitoring orphan file.
- Monitoring kuota storage upload di `/health` (total file, total bytes, persentase kuota) dan enforcement kuota per properti.
- Reports export (`/reports/exports`).
- Audit viewer (`/audit/*`).
- Payment gateway demo/sandbox (Midtrans) - future milestone, jalur manual proof tetap fallback.
- Receipt/nota untuk pembayaran terverifikasi - future milestone.
- Smart Lock live Tuya/PALOMA (M10G) - menunggu akses fisik perangkat.
- CCTV live integration - menunggu gateway lokal.

Tidak didukung fase ini (bukan backlog): chat attachment, video upload.

## Security

- Desain RBAC/permission matrix.
- Desain audit log untuk smart lock dan CCTV.
- Definisikan rate limit untuk login, OTP, smart lock, dan CCTV preview.
- Add audit masking before enabling audit for Penghuni, Billing, Smart Lock, CCTV, and private file data.

## Platform

- Tentukan deployment target untuk `admin.kostsaya.com` dan `penghuni.kostsaya.com`.
- Tentukan strategi PWA Penghuni: manifest, service worker, offline state, dan push notification.

## Future Features

### Vehicle Management

Priority: Medium

Deskripsi:
Pendataan kendaraan penghuni untuk kebutuhan administrasi dan keamanan lingkungan kost.

Scope Awal:

* plate_number
* vehicle_type (motorcycle, car, bicycle, other)
* brand
* color
* resident relation
* property relation

Catatan:

* Satu penghuni dapat memiliki lebih dari satu kendaraan.
* Data kendaraan digunakan untuk identifikasi penghuni dan keamanan lingkungan kost.
* Approval perubahan data kendaraan dilakukan oleh Admin.

Status:
Deferred until backend foundation is completed.

### Technical Debt

#### TD-003 — Email Case-Insensitive Uniqueness

Priority: High
Status: Deferred

Description:
Email uniqueness harus menjadi case-insensitive sebelum production release.

Contoh:
`Owner@Test.com` dan `owner@test.com` harus dianggap identik.

Target: Production Hardening Phase

---

#### TD-004 — File Metadata Integration

Priority: Medium
Status: Resolved — M12C1 (2026-07-03)

Resolution:
File Module telah diimplementasikan pada M12C1. Tabel `files` menjadi source of truth metadata (migration `011_files.sql`), FK pada junction table ditambahkan melalui conditional migration, soft-delete + retention policy diterapkan, dan strategi signed URL digantikan oleh backend-mediated content streaming (`GET /files/:fileId/content`) sesuai ADR-BE-FILE-001.

Original description (historis):
`payment_proof_files.file_id` saat itu belum memiliki foreign key karena File Module belum diimplementasikan.

Checklist asli saat File Module dibuat (kini terpenuhi via M12C1):
- Review relasi `payment_proof_files`
- Tambahkan FK ke file metadata table
- Evaluasi soft delete strategy
- Evaluasi retention policy
- Evaluasi signed URL strategy

Reason:
Menghindari coupling terhadap modul file yang belum tersedia pada Milestone 6.

Target: Future File Storage Module

---

#### TD-005 — Billing Unit Test Coverage

Priority: Medium
Status: Deferred

Description:
Billing calculation helpers saat ini belum memiliki dedicated unit test coverage.

Scope:
- `invoice-calculation.helper`
- `outstanding-balance.helper`
- `late-fee-calculation.helper`
- `payment-allocation.helper`

Required Before Production:
- Happy path tests
- Partial payment tests
- Multiple allocation tests
- Late fee cap tests
- Overdue calculation tests
- Rounding tests

Target: Production Hardening Phase

---

#### TD-006 — Seed Safety

Priority: High
Status: Deferred

Description:
Current room seed menggunakan `ON CONFLICT DO UPDATE`. Sebelum production release, seed harus aman untuk re-run.

Required Before Production:
- Prevent occupied rooms dari overwrite
- Prevent active occupancy data dari reset
- Prevent `room_status` dipaksa menjadi `vacant` ketika active occupancy masih ada

Target: Production Hardening Phase

---

#### TD-CMP-001 — Common Area Complaint (room_id Nullable)

Priority: Medium
Status: Decided — room_id nullable

Description:
Complaint untuk area umum (parkiran, tangga, koridor, lobby, laundry, gerbang) tidak terkait kamar tertentu. Field `complaints.room_id` harus nullable agar complaint area umum bisa dibuat tanpa room reference.

Action:
- Set `complaints.room_id` sebagai nullable di migration
- Tambahkan `location_note` field opsional untuk deskripsi lokasi area umum
- Update COMPLAINT_DOMAIN.md BD-CMP-01 sebagai decided

Target: Complaint Module Migration (Phase 7B)

---

#### TD-CMP-002 — Future Technician Skill Taxonomy

Priority: Low
Status: Deferred

Description:
`technician_profiles.skill_tags` saat ini berupa teks biasa. Jika jumlah teknisi bertambah dan spesialisasi menjadi penting (AC, Listrik, Plumbing, Internet, Furniture), skill sebaiknya dikelola melalui master table agar bisa difilter dan dicocokkan dengan kategori complaint.

Phase 1:
- `skill_tags` teks biasa sudah cukup.

Future:
- Buat `technician_skills` master table
- Buat `technician_skill_assignments` relasi many-to-many
- Opsional: auto-suggest teknisi berdasarkan skill match dengan kategori complaint

Target: Phase 2 — Maintenance Expansion

---

#### TD-CMP-003 — Configurable Complaint Auto-Close Duration

Priority: Medium
Status: Deferred

Description:
Auto-close duration complaint setelah status `resolved` saat ini di-hardcode 72 jam. Owner/manager sebaiknya bisa mengatur durasi ini sesuai kebutuhan operasional properti.

Opsi yang didukung:
- 24 jam
- 72 jam (default)
- 7 hari

Action:
- Tambahkan `complaint_auto_close_hours` ke `property_settings`
- Default value: 72
- Auto-close scheduler membaca setting per property

Target: Complaint Module Backend (Phase 7C) atau Property Settings Enhancement