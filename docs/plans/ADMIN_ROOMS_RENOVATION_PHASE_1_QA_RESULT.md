# Admin Rooms Renovation Phase 1 QA Result

Date: 2026-07-09
Role: QA Engineer / Release Engineer
Scope: Admin `/rooms` renovation Phase 1 validation only

## Verdict

PARTIAL

Static implementation validation, lint/typecheck/build validation, API smoke, and public `/kamar` service smoke passed. The release verdict is PARTIAL because:

- `git status --short` showed an unrelated untracked file outside the requested admin rooms UI/docs scope: `docs/hotfixes/HOTFIX_RM01C_QA_RESULT.md`.
- Admin `/rooms` frontend service smoke on `127.0.0.1:3100` could not be completed in this pass. The sandbox blocked loopback access, and the escalation reviewer rejected the rerun due usage-limit policy.
- Browser visual/functional QA was not executed per VPS browser tooling policy.

No source files were modified by QA. This document was updated only to record validation results.

## Files Changed / Scope Check

| Command | Result | Notes |
| --- | --- | --- |
| `git status --short` | PARTIAL | Showed `?? docs/hotfixes/HOTFIX_RM01C_QA_RESULT.md`, outside the expected Phase 1 file list. |
| `git diff --name-only` | PASS | Empty output before this QA document update; no tracked source diff present at validation start. |

Reported implementation files were present in the working tree:

- `apps/admin/src/routes/rooms.tsx`
- `apps/admin/src/components/forms/RoomFormDialog.tsx`
- `apps/admin/src/components/rooms/RoomDetailDrawer.tsx`
- `apps/admin/src/components/rooms/RoomActionMenu.tsx`
- `apps/admin/src/components/rooms/StatusChangeDialog.tsx`
- `apps/admin/src/components/rooms/ArchiveConfirmDialog.tsx`
- `docs/plans/ADMIN_ROOMS_RENOVATION_PHASE_1_RESULT.md`

Safety scope result:

- No backend source changes observed by `git diff --name-only`.
- No database migration changes observed.
- No public `/kamar`, Payment Gateway, Smart Lock, booking lead, or gallery backend changes observed.
- Current QA-created/updated file: `docs/plans/ADMIN_ROOMS_RENOVATION_PHASE_1_QA_RESULT.md`.

## Static Validation Checklist

| Check | Result | Evidence |
| --- | --- | --- |
| Compact table columns: Kamar, Gender, Status, Visibilitas, Harga, Aksi | PASS | `FloorRoomTable` renders those columns; `Aksi` appears only when management actions are available. |
| Fasilitas removed from table | PASS | No facilities table column; facilities remain in `RoomDetailDrawer`. |
| View Detail drawer exists and is wired | PASS | `RoomDetailDrawer` imported and rendered at page level with `detailTarget`. |
| Row click opens detail drawer | PASS | Room row calls `actions.onView(room)`. Action cell stops propagation. |
| Action menu includes View, Edit, Ubah Status, Nonaktifkan/Aktifkan Kembali | PASS | `RoomActionMenu` includes view/edit icon buttons and status/archive menu items. |
| Ubah Status uses existing `useUpdateRoomStatus` hook | PASS | `StatusChangeDialog` calls `useUpdateRoomStatus`. |
| Nonaktifkan uses `status=inactive` through existing status hook | PASS | `ArchiveConfirmDialog` maps active rooms to `inactive`; inactive rooms reactivate to `vacant`. |
| No hard delete endpoint or delete mutation introduced | PASS | No delete mutation or DELETE endpoint found in reviewed rooms renovation source. |
| Building groups are collapsible | PASS | `CollapsibleBuildingGroup` uses local `isOpen` state with chevron toggle. |
| Ringkasan Bangunan dan Unit compact/limited | PASS | `BuildingSummaryCompact` shows initial slice and toggles show all/less. |
| Monthly price primary, yearly secondary if present | PASS | Table displays monthly price first; yearly price is secondary text only when present. |
| Labels are Bahasa Indonesia | PASS | Main table, dialogs, tabs, and form labels are Indonesian. |
| `Label Ukuran` changed to `Ukuran Kamar` | PASS | `RoomFormDialog` uses `Ukuran Kamar`. |
| Gender `mixed/campur` renders safely | PASS | Gender maps include `mixed: "Campur"` in route and drawer; form enum includes `mixed`. |
| All four tabs remain | PASS | `Ringkasan`, `Rumah Kost`, `Apart Kost`, `Ketersediaan`. |
| Permission gating remains for management actions | PASS | `hasPermission("room.manage")` gates create/edit/status/archive; view remains available. |
| No public visibility toggle added | PASS | Visibility is displayed/filterable only; no mutation or form field added. |
| No yearly price input added to form | PASS | Form has monthly price and deposit only. |

## Build / Type / Lint Validation

| Command | Result | Notes |
| --- | --- | --- |
| `npm --workspace @granada-kost/admin run lint` | PASS | 0 errors, 15 warnings. Warnings are existing fast-refresh/hooks/unused-disable warnings outside this renovation scope. |
| `npm --workspace @granada-kost/admin run typecheck` | PASS | `tsc --noEmit` succeeded. |
| `npm --workspace @granada-kost/admin run build` | PASS | Vite client and SSR build succeeded. Standard plugin timing/deprecation messages only. |
| `npm --workspace @granada-kost/api run build` | PASS | Nest build succeeded. |
| `npm --workspace @granada-kost/penghuni run build` | PASS | Vite client and SSR build succeeded. Standard plugin timing/deprecation messages only. |
| `git diff --check` | PASS | No whitespace errors. |

## API Smoke Results

Target: existing local API on `http://127.0.0.1:3000/api/v1`.

| Endpoint | Expected | Actual | Result |
| --- | --- | --- | --- |
| `GET /api/v1/health` | 200 | 200 | PASS |
| `GET /api/v1/public/hunian-catalog` | 200 | 200 | PASS |
| `GET /api/v1/public/rooms/summary` | 200 | 200 | PASS |
| `GET /api/v1/booking-leads` unauth | 401 | 401 | PASS |
| `GET /api/v1/hunian-gallery` unauth | 401 | 401 | PASS |

Notes:

- Some localhost curls were blocked by sandbox loopback restrictions and were rerun with explicit escalation metadata.
- No backend restart was performed during this QA pass.

## Frontend Service Smoke

| Route | Expected | Actual | Result |
| --- | --- | --- | --- |
| `http://127.0.0.1:3100/rooms` | 200 | Not executed | PARTIAL: sandbox blocked loopback and escalation was rejected by reviewer usage-limit policy. |
| `http://127.0.0.1:3101/kamar` | 200 | 200 | PASS |

No `granada-admin.service` restart was performed in this pass.

## Safety Scan

PASS with scope note.

- No backend files modified by QA.
- No database files or migrations modified.
- No public `/kamar` source modified.
- No Payment Gateway files modified.
- No Smart Lock files modified.
- No booking lead files modified.
- No gallery backend files modified.
- No hard delete was introduced.
- No public visibility toggle was introduced.
- No yearly price input was added to the room form.
- Unrelated untracked file remains present: `docs/hotfixes/HOTFIX_RM01C_QA_RESULT.md`.

## Browser Limitation

Browser visual/functional QA not executed due VPS browser tooling policy.

No Playwright, Puppeteer, Chromium, or browser tooling was installed.

## Known Limitations

- Full browser behavior such as row click, drawer animation, action menu interaction, and dialog submit UX was validated statically, not visually.
- Admin `/rooms` HTTP service smoke could not be completed because sandbox loopback was blocked and escalation was rejected by reviewer policy.
- The expected Phase 1 implementation files are present, but `git diff --name-only` did not show them as current tracked diffs at validation start, suggesting the implementation was already committed or otherwise outside the current diff.
- An unrelated untracked hotfix QA doc is present and should be resolved before a clean release handoff.

## Final Recommendation

PARTIAL. The Admin Rooms Renovation Phase 1 UI implementation is structurally valid and build/API-safe, but do not mark this as a clean release PASS until the unrelated untracked file is resolved and admin `/rooms` service smoke is completed or explicitly accepted as a known validation limitation.
