# Changelog

## 2026-06-17

### Backend Foundation
- NestJS bootstrap
- PostgreSQL foundation
- Redis foundation
- Health Check
- Validation
- Exception Filter
- Logger

### IAM + RBAC
- Users
- Roles
- Permissions
- User Sessions
- JWT Auth
- Refresh Token Rotation
- Audit Logs

### Property + Room
- Property Module
- Room Module
- Property owner read-only scope
- Room availability endpoint
- Room master fields: `unit_code`, `gender_policy`

### Resident + Occupancy
- Resident Module
- Emergency Contacts
- Occupancy Module
- Check-in and Check-out foundation
- Occupancy history
- Room status sync with active occupancy

### Seed Data
- Core seed Layer 0-4
- Master room seed Layer 5: 163 rooms
- Development seed Layer 6: 10 dummy residents, 8 active occupancies
- Seed validation checks

### Billing
- Billing migration
- Billing repository and service foundation
- Billing API Phase 1
- Development billing seed and workflow validation

### Complaint + Maintenance
- Complaint and maintenance migration
- Repository and service foundation
- Complaint and work order API Phase 1
- Complaint category seed: 10 categories
- Development technician, complaint, and work order seed
- Complaint workflow validation script

## 2026-06-18

### Vehicle + Parking
- Vehicle and parking migration
- Repository, service, helper, and audit foundation
- Vehicle and parking API Phase 1
- Development vehicle seed: 9 dummy vehicles
- Development parking seed: 3 zones and 6 slots
- Vehicle and parking workflow validation script
- Build, lint, dev seed, and workflow validation passed

## 2026-06-19

### Notification
- Notification migration
- Repository, service, provider abstraction, helper, template, and audit foundation
- Notification API Phase 1
- Development notification preference seed: 5 users
- Development in-app notification seed: 8 samples
- Development delivery seed: 5 Brevo email dummy records
- Notification workflow validation script
- Build, lint, dev seed, and workflow validation passed

## 2026-06-26

### Smart Lock
- Smart Lock migration: `009_smart_lock.sql`
- Repository, service, helper, gateway abstraction, and audit foundation
- Tuya gateway skeleton without real provider call
- Smart Lock API Phase 1 through M10E
- RBAC permission mapping: `smart_lock.read`, `smart_lock.manage`, `smart_lock.command`
- Property scope and resident active access grant self-scope
- Command endpoint uses simulated gateway response and rate limit helper
- Build and lint passed

## 2026-06-30

### Frontend Integration Planning (M11A)
- Added `docs/10-frontend/FRONTEND_INTEGRATION_PLAN.md`
- Mapping Admin and Penghuni pages to backend endpoints
- Priority list, milestone sequencing (M11B..M11J)
- Risks, Definition of Done, deferred items documented
- Verdict: ready to proceed to M11B

### Frontend Architecture Freeze (M11AF)
- Added `docs/01-architecture/FRONTEND_ARCHITECTURE_DECISIONS.md` with ADR-FE-001..ADR-FE-011
- Appended M11AF review addendum (section 23) to `FRONTEND_INTEGRATION_PLAN.md`
- Promoted Vehicle + Parking UI to M11D (backend M8 already done)
- Clarified Dashboard Admin integrated at end of M11C, not first
- Confirmed Smart Lock simulated strategy until M10G real Tuya runtime ships
- Verdict: Frontend Architecture Frozen

### Frontend Foundation (M11B / M11BV)
- `packages/api-client`: fetch wrapper, single-flight refresh queue, idempotency, correlation id, ApiError normalization
- `packages/domain`: shared types, enums, envelopes, error codes, money + date helpers
- Admin app: env validation, query client defaults, AuthProvider + AuthGuard + login/logout/refresh, PropertyProvider with cache-bleed protection, RBAC-aware nav items
- Penghuni app: equivalent foundation pieces wired (login, AuthGuard, base routes)
- Build, lint, typecheck passed

### Admin Core Data (M11C / M11CV)
- Rooms list integrated (`GET /rooms`) with property scope and search
- Residents list integrated (`GET /residents`) with server search + PII masking
- Dashboard summary aggregated from `/rooms`, `/residents`, `/billing/aging-summary`
- Skeleton, empty, filtered-empty, and error states for every list
- Build, lint, typecheck passed

### Admin Operational (M11D / M11DV)
- Billing list integrated (`GET /invoices`, `GET /payments`) with tabs and aging stats
- Complaint list integrated (`GET /complaints`, `GET /complaint-categories`) with status mapping and per-category chart
- Vehicle list integrated (`GET /vehicles`) with status + type filter
- Parking list integrated (`GET /parking/zones`, `GET /parking/slots`) with capacity pill
- All disabled action buttons labeled "tersedia di M11E"
- Build, lint, typecheck passed

### Admin Operational Mutations (M11E)
- Mutation infrastructure: `lib/idempotency.ts`, `lib/mutation-feedback.ts`, `components/confirm/ConfirmDialog.tsx`
- Domain hooks: `useRoomMutations`, `useResidentMutations`, `useOccupancyMutations` (check-in), `useBillingMutations`, `useComplaintMutations`, `useVehicleMutations`, `useParkingMutations`
- Rooms: create, edit, update status (`POST /rooms`, `PATCH /rooms/:id`, `PATCH /rooms/:id/status`)
- Residents: create, edit, update status (`POST /residents`, `PATCH /residents/:id`, `PATCH /residents/:id/status`)
- Occupancy: completeCheckIn from Tenants (`POST /check-ins`); check-out lifecycle deferred (no occupancy picker)
- Billing: invoice issue + cancel (`POST /invoices/:id/issue`, `.../cancel`); payment verify + reject (`POST /payments/:id/verify`, `.../reject`); invoice create + payment-proof verdict deferred (no HTTP route for proof verdict, no snapshot picker)
- Complaints: acknowledge, resolve, close, reopen, cancel (`POST /complaints/:id/{acknowledge,resolve,close,reopen,cancel}`); assign deferred (no technician picker)
- Vehicles: approve, reject, suspend, reactivate, deactivate (`POST /vehicles/:id/{approve,reject,suspend,reactivate,deactivate}`); create/edit deferred (no resident picker)
- Parking: assign + release slot (`POST /parking/slots/:id/{assign,release}`); zone/slot create deferred
- UX: idempotency-key on every write, react-hook-form + zod inline validation, ConfirmDialog for sensitive verbs with typed reason (MinLength 3) where backend requires, sonner toast with ApiError correlationId, RBAC-aware action visibility, no PII in console
- Build, lint, typecheck passed
