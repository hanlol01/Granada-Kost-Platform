# ADMIN_ROOMS_RENOVATION_PLAN — Admin Room Management UX Redesign

**Date**: 2026-07-09
**Author**: Antigravity (Planning Agent)
**Status**: PLAN ONLY — No files modified
**Prerequisite**: HOTFIX-RM01C applied and stable

---

## 1. Current UX Diagnosis

### 1.1 What Exists Post-HOTFIX-RM01C

The admin `/rooms` page has been recovered with:
- ✅ 4-tab layout: Ringkasan, Rumah Kost, Apart Kost, Ketersediaan
- ✅ Tambah Kamar button (gated by `room.manage` permission)
- ✅ Edit pencil action per room row
- ✅ RoomFormDialog wired for create/edit
- ✅ Summary dashboard with 8 metric cards
- ✅ Building summary table
- ✅ Availability view with public listing readiness
- ✅ Filter bar with 6 filters (search, gender, building, floor, status, visibility)
- ✅ Visibility stats hardened (`=== true` checks)

### 1.2 UX Problems Identified

| # | Problem | Severity | Location |
|---|---------|----------|----------|
| P1 | **Table is overloaded** — 8 columns visible at once (Room Code, Nomor Legacy, Gender, Status, Public, Harga, Fasilitas, Aksi) | 🔴 High | `FloorRoomTable` L631-681 |
| P2 | **No View/Detail action** — admin cannot see full room details without editing | 🔴 High | `FloorRoomTable` |
| P3 | **No Delete/Archive action** — no way to remove or deactivate a room from admin UI | 🔴 High | Missing |
| P4 | **"Label Ukuran" field label is unclear** — user doesn't understand what this means | 🟡 Medium | `RoomFormDialog` L147 |
| P5 | **Price display is misleading** — shows `yearlyPrice ?? monthlyPrice` with suffix logic, doesn't show both prices side by side | 🟡 Medium | `FloorRoomTable` L656-661 |
| P6 | **Form modal is too limited** — only 7 fields (number, unitCode, floor, sizeLabel, genderPolicy, monthlyPrice, depositAmount). Missing: status, publicVisible, yearlyPrice, category, buildingId, facilityIds picker, roomCode, primaryPhoto | 🟡 Medium | `RoomFormDialog` |
| P7 | **"Room Code" and "Nomor Legacy" columns are confusing** — both show room identifiers but are semantically unclear for non-technical admin | 🟡 Medium | `FloorRoomTable` L634-635 |
| P8 | **Fasilitas column truncated** — shows max 3, no way to see all | 🟠 Low | `FloorRoomTable` L663-668 |
| P9 | **No bulk actions** — can't change status of multiple rooms at once | 🟠 Low | Missing |
| P10 | **English/Indonesian mix** — "Room Code", "Gender Policy", "Public", "Status" mixed with Indonesian labels | 🟠 Low | Various |
| P11 | **Form fields use English labels** — "Gender Policy" instead of "Kebijakan Gender" | 🟠 Low | `RoomFormDialog` L150 |
| P12 | **No confirmation dialog for destructive actions** — status change to "inactive" has no confirmation | 🟡 Medium | Missing |

### 1.3 RoomFormDialog Field Gap Analysis

| Field | In Form? | In CreateRoomDto? | In UpdateRoomDto? | In RoomRecord API? | Notes |
|-------|----------|-------------------|-------------------|--------------------|-------|
| `number` | ✅ | ✅ required | ✅ optional | ✅ | |
| `unitCode` | ✅ | ✅ optional | ✅ optional | ✅ | |
| `floor` | ✅ | ✅ optional | ✅ optional | ✅ | |
| `sizeLabel` | ✅ | ✅ optional | ✅ optional | ✅ | Rename label to "Ukuran Kamar" |
| `genderPolicy` | ✅ | ✅ optional | ✅ optional | ✅ | |
| `monthlyPrice` | ✅ | ✅ required | ✅ optional | ✅ | |
| `depositAmount` | ✅ | ✅ required | ✅ optional | ✅ | |
| `roomTypeId` | ❌ | ✅ optional | ✅ optional | ✅ | Can add with room type picker |
| `facilityIds` | ❌ | ✅ optional | ✅ optional | Read as `facilities[]` | Can add with multi-select |
| `primaryPhotoFileId` | ❌ | ✅ optional | ✅ optional | ✅ | Requires file upload foundation |
| `yearlyPrice` | ❌ | ❌ | ❌ | ✅ (read-only) | **Backend gap** — not in any DTO |
| `publicVisible` | ❌ | ❌ | ❌ | ✅ (read-only) | **Backend gap** — not in any DTO |
| `category` | ❌ | ❌ | ❌ | ✅ (read-only) | Managed via building/import |
| `buildingId` | ❌ | ❌ | ❌ | ✅ (read-only) | Managed via building/import |
| `roomCode` | ❌ | ❌ | ❌ | ✅ (read-only) | Managed via building/import |
| `roomStatus` | ❌ (separate API) | ❌ | ❌ | ✅ | Via `PATCH /rooms/:id/status` |

---

## 2. Keep / Change / Remove Decision Matrix

### 2.1 KEEP (preserve exactly)

| Element | Why |
|---------|-----|
| 4-tab layout (Ringkasan, Rumah Kost, Apart Kost, Ketersediaan) | Core information architecture is sound |
| Summary dashboard with metric cards | Useful admin overview |
| Building summary table in Ringkasan tab | Good aggregate view |
| Status breakdown bar chart | Clear status distribution |
| Availability view with public listing readiness | Business-critical visibility |
| Filter bar (search, gender, building, floor, status, visibility) | Comprehensive filtering |
| Room grouping by building → floor | Logical hierarchy |
| Permission gating (`room.manage`) | Security requirement |
| `RoomFormDialog` architecture (react-hook-form + zod + server error mapping) | Robust form pattern |
| `useRoomMutations` hooks (create, update, updateStatus) | Clean mutation pattern |

### 2.2 CHANGE (modify/improve)

| Element | Current | Proposed |
|---------|---------|----------|
| Table columns | 8 columns all visible | Slim down to 5-6 essential columns |
| Price column | Single price (yearly OR monthly) | Dual display: monthly primary, yearly secondary |
| Action column | Edit pencil only | View, Edit, Status, Archive actions in dropdown |
| "Label Ukuran" | Unclear | Rename to "Ukuran Kamar (m²)" |
| "Gender Policy" | English label | "Kebijakan Gender" |
| RoomFormDialog fields | 7 fields | Expand to include roomTypeId, facilityIds multi-select |
| Room identifier display | "Room Code" + "Nomor Legacy" | "Kode Kamar" primary, "Nomor" as secondary/tooltip |
| Fasilitas column | Truncated text | Badge-style, 3 max with "+N" indicator |

### 2.3 REMOVE from table (move to View Detail)

| Element | Reason |
|---------|--------|
| Full facility list | Too noisy in table; show in detail |
| "Nomor Legacy" as separate column | Redundant with Kode Kamar; show in detail |
| Full price breakdown | Table shows monthly summary; detail shows both |
| Building/Unit information | Already grouped by building header; redundant in row |

---

## 3. Proposed Information Architecture

```
/rooms
├── Tab: Ringkasan (Summary)
│   ├── 8 Metric Cards (KEEP)
│   ├── Status Breakdown (KEEP)
│   └── Building Summary Table (KEEP)
│
├── Tab: Rumah Kost (inventory)
│   ├── Filter Bar (KEEP)
│   └── Building Groups (KEEP grouping, CHANGE table columns)
│       └── Floor Tables
│           └── Per-room row → View | Edit | ⋮ More
│
├── Tab: Apart Kost (inventory)
│   └── (same structure as Rumah Kost)
│
└── Tab: Ketersediaan (Availability)
    ├── 4 Metric Cards (KEEP)
    ├── Availability Bars (KEEP)
    └── Booking Info Card (KEEP)

Overlays:
├── RoomDetailDrawer (NEW) — slide-out panel with full room data
├── RoomFormDialog (IMPROVED) — create/edit with expanded fields
├── StatusChangeDialog (NEW) — confirmation for status transitions
└── ArchiveConfirmDialog (NEW) — confirmation for archiving (status → inactive)
```

---

## 4. Proposed Table Columns

### Inventory Table (Rumah Kost / Apart Kost tabs)

| # | Column | Content | Width | Notes |
|---|--------|---------|-------|-------|
| 1 | **Kamar** | Room code (primary), nomor (secondary text) | Auto | `room.roomCode ?? room.number` primary; `room.number` as secondary if different |
| 2 | **Gender** | Badge: Putra / Putri / Campur | 80px | Colored badge |
| 3 | **Status** | Badge: Kosong / Terisi / etc. | 100px | Existing `RoomStatusBadge` |
| 4 | **Visibilitas** | Badge: Publik / Internal | 90px | Existing `PublicFlagBadge` |
| 5 | **Harga/Bulan** | `formatIDR(monthlyPrice)` | 120px | Monthly as primary display |
| 6 | **Aksi** | View · Edit · ⋮ (dropdown with Status, Archive) | 120px | Action buttons/dropdown |

**Removed from table:** Nomor Legacy (separate column), Fasilitas (full list), Harga Tahunan (moved to detail)

### Action Column Design

```
[👁 View] [✏ Edit] [⋮]
                    ├─ Ubah Status →
                    │   ├─ Kosong
                    │   ├─ Terisi
                    │   ├─ Dipesan
                    │   ├─ Maintenance
                    │   └─ Perlu Review
                    ├─ ─────────────
                    └─ Nonaktifkan (archive)
```

---

## 5. Proposed View Detail Drawer/Modal

### Design: Slide-out Drawer (right side)

A `Sheet` component (from shadcn/ui) sliding from the right, width ~480px.

### Content Sections:

```
┌──────────────────────────────────────┐
│ [Photo placeholder / Room photo]     │
│                                      │
│ ═══ Informasi Kamar ═══             │
│ Kode Kamar:        RKA-B-01          │
│ Nomor Kamar:       101               │
│ Kategori:          Rumah Kost         │
│ Gedung/Unit:       Blok A             │
│ Lantai:            Lantai Bawah       │
│ Ukuran Kamar:      3x4 m             │
│ Kebijakan Gender:  [Putra]            │
│                                      │
│ ═══ Status & Visibilitas ═══        │
│ Status:            [Kosong]           │
│ Visibilitas:       [Publik]           │
│                                      │
│ ═══ Harga ═══                        │
│ Harga Bulanan:     Rp 1.500.000      │
│ Harga Tahunan:     Rp 15.000.000     │
│ Deposit:           Rp 500.000        │
│                                      │
│ ═══ Fasilitas ═══                    │
│ [AC] [WiFi] [Kamar Mandi Dalam]     │
│ [Kasur] [Lemari]                     │
│                                      │
│ ═══ Metadata ═══                     │
│ Room Type:         Tipe Standar       │
│ ID:                uuid-abc...        │
│ Property ID:       uuid-xyz...        │
│                                      │
│ ─────────────────────────────────    │
│           [Edit Kamar]  [Tutup]       │
└──────────────────────────────────────┘
```

### Data Source
All data comes from existing `RoomRecord` — **no additional API call needed** since all fields are already loaded in the list response.

---

## 6. Proposed Add/Edit Modal Fields

### Phase 1 (backend-supported, safe to implement now)

| Field | Label | Type | Create Required? | Supported by Backend |
|-------|-------|------|------------------|---------------------|
| `number` | Nomor Kamar | Text input | ✅ Yes | ✅ Create + Update |
| `unitCode` | Kode Unit | Text input | Optional | ✅ Create + Update |
| `floor` | Lantai | Text input or Select | Optional | ✅ Create + Update |
| `sizeLabel` | Ukuran Kamar | Text input, placeholder "3x4" | Optional | ✅ Create + Update |
| `genderPolicy` | Kebijakan Gender | Select (Putra/Putri/Campur) | Optional (defaults mixed) | ✅ Create + Update |
| `monthlyPrice` | Harga Bulanan (IDR) | Number input | ✅ Yes | ✅ Create + Update |
| `depositAmount` | Deposit (IDR) | Number input | ✅ Yes | ✅ Create + Update |
| `roomTypeId` | Tipe Kamar | Select (from `GET /room-types`) | Optional | ✅ Create + Update |
| `facilityIds` | Fasilitas | Multi-select (from `GET /room-facilities`) | Optional | ✅ Create + Update |
| `primaryPhotoFileId` | Foto Utama | File upload | Optional | ✅ Create + Update (if upload engine available) |

### Phase 2 (requires backend DTO changes)

| Field | Label | Backend Gap |
|-------|-------|-------------|
| `yearlyPrice` | Harga Tahunan (IDR) | ❌ Not in CreateRoomDto or UpdateRoomDto |
| `publicVisible` | Visibilitas Publik | ❌ Not in any update DTO |
| `category` | Kategori (Rukost/Apartkost) | ❌ Managed via building assignment, not room-level |
| `buildingId` | Gedung/Unit | ❌ Not in any DTO — assigned via import/building management |

### Form Layout (Phase 1)

```
┌──────────────────────────────────────┐
│        Tambah Kamar / Edit Kamar      │
│                                      │
│ Nomor Kamar *          [           ] │
│                                      │
│ Kode Unit      Lantai                │
│ [           ]  [▼ Pilih Lantai     ] │
│                                      │
│ Ukuran Kamar   Kebijakan Gender      │
│ [           ]  [▼ Campur         ↓] │
│                                      │
│ ─── Harga ───                        │
│ Harga Bulanan (IDR) *                │
│ [               ]                    │
│ Deposit (IDR) *                      │
│ [               ]                    │
│                                      │
│ ─── Opsional ───                     │
│ Tipe Kamar                           │
│ [▼ Pilih tipe kamar             ↓]  │
│                                      │
│ Fasilitas                            │
│ [☑ AC] [☑ WiFi] [☐ Kasur] [☐ ...]  │
│                                      │
│         [Batal]  [Simpan Kamar]      │
└──────────────────────────────────────┘
```

---

## 7. Price Display Plan

### Table View
- **Primary**: `Rp X.XXX.XXX/bln` — always show monthly price
- Monthly price is the business-primary pricing unit for kost operations

### Detail Drawer
- **Harga Bulanan**: `Rp 1.500.000`
- **Harga Tahunan**: `Rp 15.000.000` (if `yearlyPrice` exists), or `—` if null
- **Deposit**: `Rp 500.000`

### Form
- **Phase 1**: Only `monthlyPrice` and `depositAmount` (backend-supported)
- **Phase 2**: Add `yearlyPrice` field (pending backend DTO change)

### Why Monthly-First?
1. Most tenants pay monthly
2. `monthlyPrice` is always present (required field)
3. `yearlyPrice` is nullable and optional
4. Avoids confusing admin with yearly-only display when monthly is the operational unit

---

## 8. Delete vs Archive Safety Recommendation

### Current Backend State

| Capability | Supported? | Evidence |
|------------|-----------|----------|
| `DELETE /rooms/:roomId` | ❌ **No endpoint exists** | `room.controller.ts` has no `@Delete` decorator |
| Hard delete in repository | ❌ **No method exists** | `room.repository.ts` has no `deleteRoom` method |
| Soft delete / `deleted_at` column | ❌ **Unknown** | Not visible in DTO or repository |
| `PATCH /rooms/:roomId/status` → `inactive` | ✅ **Fully supported** | Controller L59-68, `UpdateRoomStatusDto` accepts `inactive` |

### Recommendation: **Archive via Status = "inactive" (Nonaktifkan)**

Instead of DELETE, use the existing `PATCH /rooms/:roomId/status` endpoint with `status: "inactive"`.

| Action | Implementation | Risk |
|--------|---------------|------|
| **Nonaktifkan (Archive)** | `useUpdateRoomStatus({ roomId, status: 'inactive' })` | ✅ Zero risk — existing, tested endpoint |
| **Delete** | Would need new backend endpoint + cascade logic for facility_assignments, booking_leads, billing | ⛔ Not safe without backend work |

### UI Implementation

1. Add "Nonaktifkan" action in the room row dropdown menu
2. Show a confirmation dialog: *"Yakin ingin menonaktifkan kamar [code]? Kamar akan disembunyikan dari katalog publik dan tidak dapat dipesan."*
3. Require typing room code or clicking "Konfirmasi" to proceed
4. After success, room remains in admin list with `Tidak Aktif` badge
5. Add "Aktifkan Kembali" reverse action (set status to `vacant`)

---

## 9. Backend/API Contract Gaps

### Available Endpoints (safe to use)

| Endpoint | Method | Permission | Frontend Hook |
|----------|--------|------------|---------------|
| `GET /rooms` | List all rooms | `room.read` | `useRooms()` ✅ |
| `GET /rooms/:roomId` | Get single room | `room.read` | Not used yet |
| `POST /rooms` | Create room | `room.manage` | `useCreateRoom()` ✅ |
| `PATCH /rooms/:roomId` | Update room | `room.manage` | `useUpdateRoom()` ✅ |
| `PATCH /rooms/:roomId/status` | Change status | `room.manage` | `useUpdateRoomStatus()` ✅ |
| `GET /rooms/availability` | Status aggregates | `room.read` | Not used in frontend |
| `GET /room-types` | List room types | `room.read` | Not yet created |
| `GET /room-facilities` | List facilities | `room.read` | Not yet created |

### Missing Backend Support (requires backend changes later)

| Feature | Gap | Priority |
|---------|-----|----------|
| **Set `yearlyPrice`** | Not in `CreateRoomDto` or `UpdateRoomDto` | 🟡 Phase 2 |
| **Toggle `publicVisible`** | Not in any update DTO | 🟡 Phase 2 |
| **Set `category`** | Managed at building level, not room DTO | 🟠 Low — derived from building |
| **Set `buildingId`** | Not in room create/update DTOs | 🟠 Low — managed via import |
| **Set `roomCode`** | Not in any DTO | 🟠 Low — managed via import |
| **Delete room** | No endpoint | 🟡 Phase 2+ |
| **Bulk status update** | No batch endpoint | 🟠 Phase 3 |

### Hooks to Create (frontend, for Phase 1)

| Hook | Purpose | Backend Endpoint |
|------|---------|-----------------|
| `useRoomTypes()` | Fetch room types for form dropdown | `GET /room-types` (exists via `room-type.controller.ts`) |
| `useRoomFacilities()` | Fetch facilities for form multi-select | `GET /room-facilities` (exists via `room-facility.controller.ts`) |

---

## 10. Phased Implementation Plan

### Phase 1: Frontend-Only Safe Renovation (Recommended Start)

**Goal**: Clean up admin UX without any backend changes. All changes use existing API contracts.

| Step | Task | Effort | Risk |
|------|------|--------|------|
| 1.1 | **Slim down table columns** — Remove Nomor Legacy and Fasilitas columns, consolidate room identifier display | S | ✅ Safe |
| 1.2 | **Add View Detail drawer** — New `RoomDetailDrawer` component using shadcn `Sheet` | M | ✅ Safe |
| 1.3 | **Add action dropdown menu** — Replace single pencil with View, Edit, Ubah Status, Nonaktifkan | M | ✅ Safe |
| 1.4 | **Add status change confirmation** — `StatusChangeDialog` with existing `useUpdateRoomStatus` | S | ✅ Safe |
| 1.5 | **Add archive/nonaktifkan confirmation** — Uses `useUpdateRoomStatus('inactive')` | S | ✅ Safe |
| 1.6 | **Rename form labels** — "Label Ukuran" → "Ukuran Kamar", "Gender Policy" → "Kebijakan Gender" | XS | ✅ Safe |
| 1.7 | **Fix price display** — Always show monthly in table, both in detail | S | ✅ Safe |
| 1.8 | **Add `useRoomTypes` + `useRoomFacilities` hooks** — New read-only hooks | S | ✅ Safe |
| 1.9 | **Expand form: add roomTypeId and facilityIds** — Using new hooks, existing backend DTOs | M | ✅ Safe |
| 1.10 | **Localize all labels** — English → Indonesian throughout | XS | ✅ Safe |

**Estimated total**: ~2-3 days of focused work

### Phase 2: Backend-Supported Improvements

**Goal**: Enable features that require backend DTO changes.

| Step | Task | Requires |
|------|------|----------|
| 2.1 | **Add `yearly_price` to UpdateRoomDto** | Backend DTO change |
| 2.2 | **Add `public_visible` to UpdateRoomDto** | Backend DTO change |
| 2.3 | **Add yearlyPrice field to form** | Phase 2.1 |
| 2.4 | **Add publicVisible toggle to form and detail** | Phase 2.2 |
| 2.5 | **Add `GET /rooms/:roomId` single room fetch** | Already exists — wire into detail drawer for fresh data |
| 2.6 | **Primary photo upload in room form** | Requires upload engine (FILE_UPLOAD_FOUNDATION_PLAN) |

### Phase 3: Optional Polish

| Step | Task | Notes |
|------|------|-------|
| 3.1 | Bulk status change (select multiple → change status) | Needs batch endpoint |
| 3.2 | Room data export (CSV) | Frontend-only using existing data |
| 3.3 | Advanced room search (size range, price range sliders) | Frontend-only |
| 3.4 | Room history / audit log viewer | Needs audit endpoint |
| 3.5 | Room photo gallery management | Needs M19 hunian gallery integration |
| 3.6 | Inline quick-edit for status and visibility | UX polish |

---

## 11. Risk Analysis

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| **Phase 1 breaks existing tab flow** | Medium | Low | All changes are additive — table gets slimmer, new components are overlays. Tabs structure is untouched. |
| **RoomDetailDrawer adds performance overhead** | Low | Low | Drawer renders from already-loaded list data — no extra API calls. |
| **Form expansion (roomTypeId/facilityIds) causes errors** | Medium | Low | Backend endpoints exist and are tested. Hooks follow established pattern. |
| **Status change to 'inactive' cascades unexpectedly** | Medium | Low | Backend `updateRoomStatus` only updates the status column. No cascade. Audit log created. |
| **Conflicting with M18/M19 public catalog** | High | Very Low | This plan is admin-only. No changes to public-facing code, backend, or database. |
| **Form validation mismatch with backend** | Medium | Low | Zod schema mirrors backend DTOs. Server-side 422 errors are already mapped by `applyServerErrors()`. |
| **Mobile responsiveness breaks** | Medium | Medium | Current table already requires 760px min-width. Column reduction improves mobile. Drawer needs mobile consideration. |
| **useRoomTypes/useRoomFacilities returns empty** | Low | Medium | Backend endpoints exist. If empty, form simply shows "Belum ada tipe kamar". Graceful degradation. |

---

## 12. Acceptance Criteria

### Phase 1 Complete When:

- [ ] Admin table shows ≤6 columns: Kamar, Gender, Status, Visibilitas, Harga/Bulan, Aksi
- [ ] Each room row has a "View" action that opens a detail drawer
- [ ] Detail drawer shows ALL room fields: code, number, category, building, floor, size, gender, status, visibility, monthly price, yearly price, deposit, facilities, metadata
- [ ] Each room row has an action dropdown with: Edit, Ubah Status, Nonaktifkan
- [ ] "Ubah Status" opens a confirmation dialog with status options
- [ ] "Nonaktifkan" opens a confirmation dialog that uses `PATCH /rooms/:roomId/status` → `inactive`
- [ ] Nonaktifkan action has a reverse "Aktifkan Kembali" option on inactive rooms
- [ ] "Label Ukuran" is renamed to "Ukuran Kamar" in the form
- [ ] "Gender Policy" is renamed to "Kebijakan Gender"
- [ ] Monthly price is always shown in the table (not yearly)
- [ ] Detail drawer shows both monthly and yearly prices when available
- [ ] Form includes optional `roomTypeId` dropdown (data from `GET /room-types`)
- [ ] Form includes optional `facilityIds` multi-select (data from `GET /room-facilities`)
- [ ] All existing tabs (Ringkasan, Rumah Kost, Apart Kost, Ketersediaan) remain functional
- [ ] All existing filters remain functional
- [ ] All existing metric cards remain functional
- [ ] No backend/database changes
- [ ] No public catalog changes
- [ ] Build passes with no TypeScript errors

---

## 13. Files Likely to Change (Phase 1 Only)

### MODIFY

| File | Changes |
|------|---------|
| [rooms.tsx](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/apps/admin/src/routes/rooms.tsx) | Slim table columns, add action dropdown, integrate detail drawer, fix price display, add status change flow |
| [RoomFormDialog.tsx](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/apps/admin/src/components/forms/RoomFormDialog.tsx) | Rename labels, add roomTypeId/facilityIds fields, expand zod schema |

### NEW

| File | Purpose |
|------|---------|
| `apps/admin/src/components/rooms/RoomDetailDrawer.tsx` | Slide-out detail panel |
| `apps/admin/src/components/rooms/RoomActionMenu.tsx` | Dropdown action menu per row |
| `apps/admin/src/components/rooms/StatusChangeDialog.tsx` | Confirmation for status transitions |
| `apps/admin/src/components/rooms/ArchiveConfirmDialog.tsx` | Confirmation for nonaktifkan |
| `apps/admin/src/hooks/useRoomTypes.ts` | Fetch room types for form dropdown |
| `apps/admin/src/hooks/useRoomFacilities.ts` | Fetch facilities for form multi-select |

### NOT TOUCHED

| File/Area | Reason |
|-----------|--------|
| Backend (`backend/api/src/modules/room/**`) | Plan-only, no backend changes |
| Database / migrations | No schema changes |
| Public catalog (`/kamar`) | Out of scope |
| Payment Gateway | Out of scope |
| Smart Lock | Out of scope |
| `useRooms.ts` | No changes needed — already returns all fields |
| `useRoomMutations.ts` | No changes needed — already has create/update/updateStatus |

---

## 14. What Must NOT Be Touched

| Area | Constraint |
|------|-----------|
| ❌ Backend API source code | No modifications |
| ❌ Database schema | No migrations, no SQL |
| ❌ Public `/kamar` page | Separate task |
| ❌ Payment Gateway | Not related |
| ❌ Smart Lock integration | Not related |
| ❌ Booking leads backend | Not related |
| ❌ M18/M19 features | Must preserve |
| ❌ Existing 4-tab structure | Must preserve |
| ❌ Existing metric cards | Must preserve |
| ❌ Existing filter bar | Must preserve |
| ❌ Existing building grouping | Must preserve |
| ❌ Permission gating logic | Must preserve |
| ❌ `useAuth` / RBAC | Must preserve |

---

## Final Verdict

| Criterion | Result |
|-----------|--------|
| **Plan Status** | ✅ **PASS** |
| **Summary** | Current admin `/rooms` UX is functional but overcrowded and limited. Phase 1 renovation is entirely frontend-safe, using only existing backend APIs and hooks. The plan adds View Detail drawer, action dropdown (with status change and archive/nonaktifkan), slimmer table, better labels, and expanded form fields — all without touching backend, database, or public catalog. |
| **Recommended Start** | **Phase 1** — all steps are zero-risk frontend changes |
| **Files to modify** | 2 existing + 6 new frontend files (see §13) |
| **Risk/Blockers** | No blockers for Phase 1. Phase 2 blocked on backend DTO changes for `yearlyPrice` and `publicVisible`. |
| **Estimated effort** | Phase 1: 2-3 days · Phase 2: 1-2 days (pending backend) · Phase 3: 3-5 days (optional) |
