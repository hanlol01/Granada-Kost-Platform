# Backlog

## Foundation

- Scaffold NestJS backend di `backend/api`.
- Tambahkan env schema bersama untuk backend dan frontend.
- Tambahkan CI lint/build untuk workspaces.
- Audit dependensi duplicate antara Admin dan Penghuni.

## Product

- Definisikan modul Penghuni, kamar, tagihan, pembayaran, smart lock, CCTV, komplain, dan notifikasi.
- Susun kontrak API awal di `packages/domain`.
- Buat typed API client di `packages/api-client`.

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

Email uniqueness should become case-insensitive
before production release.

Example:
Owner@Test.com
owner@test.com

must be treated as identical.

### HIGH PRIORITY TECHNICAL DEBT

Seed Safety

Current room seed uses ON CONFLICT DO UPDATE.

Before production release:

- prevent occupied rooms from being overwritten
- prevent active occupancy data from being reset
- prevent room_status from being forced to vacant
  when active occupancy exists

Production seed must be safe for re-run.