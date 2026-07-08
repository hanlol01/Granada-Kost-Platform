# HOTFIX-RM01C — Admin Rooms Management UI Recovery

**Date**: 2026-07-08  
**Scope**: Frontend-only (admin app)  
**Type**: UI regression fix — NOT a rollback  

---

## Regression Summary

The admin `/rooms` page lost its create/edit workflow during the M18/M19 revision cycle.  
`RoomFormDialog` and `useRoomMutations` existed in the codebase but were no longer imported or wired in `rooms.tsx`.

### Symptoms Found

| Issue | Location |
|-------|----------|
| No "Tambah Kamar" button on `/rooms` | `rooms.tsx` — missing from AppShell actions |
| No edit action on room rows | `FloorRoomTable` — no action column |
| `RoomFormDialog` not rendered | Never imported in `rooms.tsx` |
| `useRoomMutations` not used | `rooms.tsx` had no create/edit flow |
| Stale copy: "Booking Lead Deferred" | `AvailabilityView` — lines 699-718 |
| Stale copy: "M16F diperlukan" | `AvailabilityView` — badge |
| Stale copy: "Lead WhatsApp belum disimpan" | `AvailabilityView` — description |
| Visibility stats silently counted `undefined` as hidden | `buildStats()`, `isPublicVacant()`, `filterRooms()` |

---

## RM01A/RM01B Context

### RM01A — API Deployment Fix
- `/api/v1/public/hunian-catalog` → 200
- totalItems = 42, totalAvailable = 161
- `/api/v1/booking-leads` unauth → 401 (not 404)
- `/api/v1/hunian-gallery` unauth → 401 (not 404)

### RM01B — Read-Only DB Audit
- `rooms.public_visible`: true=161, false=2
- `room_buildings.public_visible`: true=26, false=0
- `rooms.room_status`: vacant=161, occupied=2
- `floor_code` non_null = 163
- Candidate public rooms = 161, candidate groups = 42
- **DB visibility is healthy — public API counts match DB exactly**

---

## Files Changed

| File | Action | Summary |
|------|--------|---------|
| `apps/admin/src/routes/rooms.tsx` | MODIFIED | Restored create/edit workflow, hardened visibility stats, replaced stale copy |
| `docs/hotfixes/HOTFIX_RM01C_ADMIN_ROOMS_RECOVERY.md` | NEW | This documentation |

---

## Restored Actions

### 1. Tambah Kamar Button
- Added in `AppShell` `actions` prop
- Guarded by `hasPermission("room.manage")`
- Opens `RoomFormDialog` in create mode via `createOpen` state

### 2. Edit Action on Room Rows
- Added "Aksi" column header to `FloorRoomTable`
- Added `Pencil` icon button per room row
- Guarded by `onEdit` prop presence (controlled by `canManage` permission)
- Opens `RoomFormDialog` in edit mode via `editTarget` state

### 3. RoomFormDialog Wiring
- **Create mode**: `<RoomFormDialog open={createOpen} onOpenChange={setCreateOpen} />`
- **Edit mode**: `<RoomFormDialog open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)} initial={editTarget} />`
- Both rendered at page level inside `RoomsPage`

### 4. onEdit Callback Threading
```
RoomsPage (setEditTarget)
  → CategoryInventory (onEdit prop)
    → BuildingGroup (onEdit prop)
      → FloorRoomTable (onEdit prop → Button onClick)
```

### 5. Type Compatibility
- `RoomFormDialog.initial` accepts `RoomRecord | null | undefined`
- `editTarget` state is `RoomRecord | null`
- **Fully compatible** — no mapper or cast needed

---

## Visibility Stats Hardening

### Changes

| Function | Before | After |
|----------|--------|-------|
| `buildStats()` | `if (room.publicVisible)` | `if (room.publicVisible === true)` |
| `buildStats()` | No unknown tracking | `else if (room.publicVisible == null) stats.publicVisibleUnknown += 1` |
| `isPublicVacant()` | `room.publicVisible && ...` | `room.publicVisible === true && ...` |
| `filterRooms()` | `!room.publicVisible` / `room.publicVisible` | `room.publicVisible !== true` / `room.publicVisible === true` |
| `AvailabilityView` | `!room.publicVisible` | `room.publicVisible !== true` |

### New Field: `publicVisibleUnknown`
- Added to `RoomStats` type
- Tracks rooms where `publicVisible` is `undefined` or `null`
- Displayed in SummaryView's "Public Visible" metric as "· N belum ditandai" when count > 0

### Current DB State
Per RM01B audit, all 163 rooms have explicit `public_visible` values (161 true, 2 false).  
The hardening is preventive — ensures future API changes or partial data don't silently misclassify.

---

## Stale Copy Updates

### Removed
| Copy | Location |
|------|----------|
| "Booking Lead Deferred" | AvailabilityView card title |
| "Lead WhatsApp belum disimpan di sistem pada M16C..." | AvailabilityView card description |
| "M16F diperlukan untuk lead management" | AvailabilityView badge |

### Replaced With
| New Copy | Location |
|----------|----------|
| "Minat booking aktif" | Card title |
| "Pengajuan minat booking tetap dikonfirmasi manual oleh admin. Public booking belum menjadi booking resmi." | Card description |

### Card Styling Change
- **Before**: Warning style (`border-warning/40 bg-warning/5`, `AlertTriangle` icon)
- **After**: Info/neutral style (`border-primary/30 bg-primary-soft`, `CalendarCheck` icon)
- Reason: Booking lead (M17) is complete — this is no longer a deferred/warning state

---

## What Was NOT Changed

| Area | Status |
|------|--------|
| Backend / API | ❌ Not modified |
| Database | ❌ Not modified |
| M18 Public Catalog (`/kamar`) | ❌ Not modified |
| M19 Hunian Gallery | ❌ Not modified |
| Booking Leads admin page | ❌ Not modified |
| Payment Gateway | ❌ Not modified |
| Smart Lock | ❌ Not modified |
| Gallery upload | ❌ Not modified |
| Existing tabs (Ringkasan, Rumah Kost, Apart Kost, Ketersediaan) | ✅ Preserved |
| CSV import/backfill | ❌ Not run |

---

## Public Visibility Toggle

**NOT added.** `UpdateRoomInput` type does not include `publicVisible` field. Backend `PATCH /rooms/:roomId` endpoint support for `public_visible` is unconfirmed.  
Per task rule: "add toggle only if existing backend update endpoint/hook safely supports it."  
The read-only `PublicFlagBadge` (Publik/Internal) remains displayed on room rows.

---

## Limitations

1. **No visibility toggle** — backend support unconfirmed (see above)
2. **No building-level visibility control** — `UpdateRoomInput` has no building scope
3. **Room create form** is limited to fields in `CreateRoomInput` (number, unitCode, floor, sizeLabel, genderPolicy, monthlyPrice, depositAmount). Fields like `publicVisible`, `category`, `buildingId`, `roomCode`, `yearlyPrice` are not in the create form — managed by backend/import
4. **Permission gate is UX-only** — backend enforces `room.manage` via RBAC; the UI gate simply hides the buttons for unauthorized users

---

## Validation Deferred Note

Full end-to-end validation (create a room via dialog, verify it appears in list, edit it, verify update) requires a running backend with authenticated admin session.  
Build-time type checking confirms all imports, props, and type flows are correct.  
Visual and functional validation should be performed in staging.

---

## Confirmation

- ✅ This was NOT a rollback or reset
- ✅ No files were reverted to old commits
- ✅ All existing tabs preserved
- ✅ M18/M19 features untouched
- ✅ Booking lead backend/admin page untouched
- ✅ Only `rooms.tsx` was modified (minimal patch)
