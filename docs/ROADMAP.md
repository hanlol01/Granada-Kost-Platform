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

## Next Milestone

- Billing, Complaint, Vehicle, Smart Lock, dan CCTV belum dimulai.
