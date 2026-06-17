# Roadmap

## Milestone 1 - Monorepo Foundation

- Pindahkan Admin ke `apps/admin`.
- Pindahkan Penghuni ke `apps/penghuni`.
- Buat struktur `backend/api`, `packages/*`, dan `docs`.
- Standarisasi npm workspaces.
- Dokumentasikan keputusan awal.

## Milestone 2 - Backend Foundation

- Scaffold NestJS di `backend/api`.
- Konfigurasi PostgreSQL, Redis, env validation, logging, dan health check.
- Buat kontrak API awal untuk auth, Penghuni, kamar, tagihan, pembayaran, smart lock, dan CCTV.
- Status: selesai.

## Milestone 3 - Property + Room

- Property Module.
- Room Module.
- RBAC dan audit integration.
- Property owner read-only scope.
- Status: selesai.

## Milestone 4 - Resident + Occupancy

- Resident Module.
- Emergency Contacts.
- Occupancy source of truth.
- Check-in/check-out foundation.
- Room status sync.
- Status: selesai.

## Milestone 5 - Seed Foundation

- Layer 0-4 core seed.
- Layer 5 master room seed: 123 RuKost + 40 ApartKost.
- Layer 6 development seed: dummy residents dan active occupancies.
- Status: selesai.

## Milestone 6 - Billing Phase 1

- Billing database migration.
- Billing repository and service foundation.
- Billing DTO, controller, and API endpoint.
- Manual transfer/payment proof workflow foundation.
- Development billing seed and workflow validation.
- Status: selesai.

## Milestone 7 - Complaint + Maintenance Phase 1

- Complaint and maintenance database migration.
- Repository, service, helper, and audit foundation.
- Complaint and work order API endpoint.
- Complaint category production seed.
- Development technician, complaint, and work order seed.
- Workflow validation script for complaint and maintenance.
- Status: selesai sampai 7F.

## Next Milestone

- File upload implementation, Notification, Vehicle, Smart Lock, dan CCTV belum dimulai.
