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

## Milestone 8 - Vehicle + Parking Phase 1

- Vehicle and parking database migration.
- Repository, service, helper, and audit foundation.
- Vehicle and parking API endpoint.
- Production-safe permission and parking settings seed.
- Development vehicle and parking seed.
- Workflow validation script for Vehicle and Parking.
- Status: selesai sampai 8F.

## Milestone 9 - Notification Phase 1

- Notification database migration.
- Repository, service, provider abstraction, helper, template, and audit foundation.
- Notification API endpoint for self notifications, preferences, and admin delivery monitoring.
- Production-safe notification property settings seed.
- Development notification preference, in-app notification, and delivery seed.
- Workflow validation script for Notification.
- Status: selesai sampai 9F.

## Milestone 10 - Smart Lock Phase 1

- Smart Lock planning and architecture.
- Smart Lock database migration.
- Repository, service, helper, gateway abstraction, and audit foundation.
- Smart Lock API layer with RBAC, property scope, resident self-scope, and simulated Tuya gateway response.
- Status: selesai sampai 10E.

## Milestone 11 - Frontend Integration Planning

- M11A - Frontend Integration Plan (Admin + Penghuni).
- M11AF - Frontend Architecture Freeze Review.
- Output:
  - `docs/10-frontend/FRONTEND_INTEGRATION_PLAN.md`.
  - `docs/01-architecture/FRONTEND_ARCHITECTURE_DECISIONS.md` (ADR ringan, frozen).
- Status: selesai.
- Verdict: Frontend Architecture Frozen. Implementasi M11B siap dimulai.

## Next Milestone

- M10F - Smart Lock Runtime Integration (M10FV selesai; M10G real Tuya menunggu akses fisik).
- M11B - Frontend Foundation (API client, auth, query layer, route guards).
- File upload implementation, CCTV, dan worker/provider integration belum dimulai.
