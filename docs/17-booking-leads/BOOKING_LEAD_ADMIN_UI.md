# M17C - Admin Booking Lead Management UI

> Milestone: M17C - Admin Booking Lead Management UI
> Date: 2026-07-08
> Verdict: PASS (implementation complete; technical validation deferred to M17C-QA)
> Scope: Admin frontend UI only, consuming the M17B booking lead backend API. No backend changes, no public `/kamar` lead form, no Payment Gateway changes, no Smart Lock changes, no invoice/occupancy/resident creation, no automatic room reservation.
> Binding statement: **A booking lead is not a confirmed booking. Public booking remains NOT production-ready.**

## Scope

M17C implements the authenticated Admin lead inbox so admins can view public booking leads, filter them, update lead status, and follow up via WhatsApp, per the M17A freeze (Section 7 Admin Flow) and the M17B backend contract.

Explicitly not implemented:

- Public `/kamar` "Ajukan Minat Booking" form (next milestone).
- Online payment / Payment Gateway booking integration.
- Invoice creation, occupancy creation, resident account creation.
- Automatic room reservation or room status mutation.
- Lead assignment to staff, notification automation, CRM features.
- Exact room selection or exact room number exposure.
- Smart Lock changes of any kind.

## Route / Navigation Implemented

- **Route:** `/booking-leads` in `apps/admin` (`apps/admin/src/routes/booking-leads.tsx`), flat top-level route following the existing admin route style (same pattern as `/vehicles`, `/rooms`).
- **Navigation:** sidebar item **"Minat Booking"** (icon `Inbox`) placed directly after "Kamar". Roles follow the M17B backend authorization: `manager` and `admin` only (property-owner is denied by the booking-leads API, so the item is hidden for owners per the ADR-FE-004 RBAC allowlist pattern).
- Page header: title "Minat Booking", subtitle "Kelola calon penyewa dari halaman publik /kamar. Lead belum menjadi booking resmi sampai dikonfirmasi admin."
- Safety strip under the header: "Belum otomatis reservasi kamar", "Tidak membuat invoice", "Konfirmasi tetap via admin/WhatsApp", plus the helper text "Status Dikonversi hanya penanda manual pada MVP ini."

## API Consumed

| Endpoint | Usage |
| --- | --- |
| `GET /api/v1/booking-leads` | Lead list via `useBookingLeads(filters)`; property-scoped (`property_id` from the active property context), server-side `status`/`category`/`gender` filters, `limit: 100` |
| `PATCH /api/v1/booking-leads/:leadId/status` | Status transition via `useUpdateBookingLeadStatus()`; body `{ status }` |

Integration details:

- Requests go through the existing shared authenticated `apiClient` (`apps/admin/src/lib/api.ts`); no new auth path.
- The list hook keys the query on `propertyId` per ADR-FE-005 to prevent cache bleed on property switch; it is enabled only when a property scope is active.
- The mutation invalidates the `["booking-leads"]` query and reuses the shared idempotency-key and toast feedback helpers (`mutation-feedback.ts`).
- Hook filter types also support `dateFrom`/`dateTo`/`search`/`offset` (M17B query params) for future use; the MVP UI exposes status/category/gender selects plus a client-side search.

## Lead List Fields Shown

Per lead row (desktop table + mobile list): `visitorName`, `visitorPhone` (mono), truncated `visitorMessage` (full text via title tooltip), category label (Rumah Kost / Apart Kost), gender label (Putra / Putri), `buildingCode` ("Unit {code}") and `floorCode` ("Lantai {code}") when present, `preferredMoveInDate` (formatted, "-" when absent), status badge, `source` label (`public_kamar` -> "Publik /kamar"), `createdAt`, and `updatedAt`.

Not shown: payment data, Smart Lock data, room IDs, exact room numbers, `publicGroupKey`, or internal metadata.

## Filters

- **Status** select: Semua / Baru / Sudah Dihubungi / Jadwal Survey / Dikonversi / Ditolak / Kedaluwarsa (server-side).
- **Category** select: Semua / Rumah Kost / Apart Kost (server-side).
- **Gender** select: Semua / Putra / Putri (server-side).
- **Search** input: client-side over visitor name, phone digits, and building code (same pattern as the Vehicles page). The backend `search` param remains available in the hook for a future server-side switch.
- Date-range (`dateFrom`/`dateTo`) UI is deferred; the hook already supports the params.

## Status Update

Status labels (frozen copy): `new` Baru, `contacted` Sudah Dihubungi, `visit_scheduled` Jadwal Survey, `converted` Dikonversi, `rejected` Ditolak, `expired` Kedaluwarsa.

UX: per-row action menu (dropdown) offering only the transitions allowed by the M17B state machine, mirrored UX-only in `allowedBookingLeadTransitions()` (backend remains authoritative):

| From | Allowed next |
| --- | --- |
| Baru | Sudah Dihubungi, Ditolak, Kedaluwarsa |
| Sudah Dihubungi | Jadwal Survey, Ditolak, Kedaluwarsa |
| Jadwal Survey | Dikonversi, Ditolak, Kedaluwarsa |
| Dikonversi / Ditolak / Kedaluwarsa | (terminal - no actions) |

- Every transition opens a ConfirmDialog. The Dikonversi confirmation states: "Status Dikonversi hanya penanda manual pada MVP ini - tidak membuat penghuni, occupancy, invoice, atau reservasi kamar otomatis. Status ini terminal." Ditolak/Kedaluwarsa confirmations warn the status is terminal and are styled destructive.
- Action menu is rendered only for users with the `room.manage` permission (matching the M17B PATCH permission); other users see a read-only list.
- Success/error toasts via the shared mutation-feedback helpers (403/429/409/422 mapped copy, correlation id surfaced).

## WhatsApp Follow-up

- Per-row button **"Hubungi via WhatsApp"** (compact "WhatsApp" on mobile), opening `https://wa.me/{phone}?text={encoded}` in a new tab with `rel="noopener noreferrer"`.
- Helper module `apps/admin/src/lib/whatsapp-lead.ts`: `normalizeWhatsAppPhone()` strips non-digits, converts a leading `0` to `62`, and treats values shorter than 8 digits as invalid (no wa.me URL is generated; the row shows "Nomor tidak valid"). `visitorPhone` is already normalized by the M17B backend; the helper re-normalizes defensively.
- Prefilled message template (visitor-submitted data + public-safe labels only; no exact room numbers/IDs):

```
Halo {visitorName}, terima kasih sudah mengajukan minat booking di Kostation.
Kami ingin mengonfirmasi kebutuhan kamar:
- Kategori: {categoryLabel}
- Untuk: {genderLabel}
- Tanggal pindah: {preferredMoveInDate atau "-"}
Apakah masih berminat untuk lanjut konfirmasi?
```

- This helper is intentionally separate from the public `/kamar` CTA helper (`apps/penghuni`) and from `VITE_PUBLIC_WHATSAPP_NUMBER`; the admin contacts the visitor's own number.

## Loading / Empty / Error States

- Loading: 5-row skeleton list.
- Empty (no filter): "Belum ada minat booking." with guidance copy; empty (filtered): "Tidak ada lead yang cocok".
- Error: shared `ErrorState` with "Data minat booking belum dapat dimuat." and a retry button (react-query `refetch`). No internal error details surfaced.

## Privacy / Safety Rules

- Lead PII (name/phone/message) is rendered only on this authenticated, RBAC-gated, property-scoped admin surface; there is no public read path (M17A binding rule).
- No payment data, Smart Lock data, room IDs, exact room numbers, or internal metadata are displayed or requested.
- No mutation other than the M17B status PATCH; no room/invoice/occupancy/resident/payment writes from this UI.
- `visitorMessage` is rendered as plain text (React-escaped, no HTML interpretation), truncated with tooltip.
- WhatsApp template contains only visitor-submitted data and public-safe labels.
- PII is never logged; error handling uses the shared normalized ApiError path (code/status/correlationId only).
- Payment Gateway and Smart Lock code paths are untouched.

## Files Changed

Frontend (apps/admin):

- `apps/admin/src/routes/booking-leads.tsx` (new - lead inbox page)
- `apps/admin/src/hooks/useBookingLeads.ts` (new - list hook, types, labels, transition map)
- `apps/admin/src/hooks/useBookingLeadMutations.ts` (new - status update mutation)
- `apps/admin/src/lib/whatsapp-lead.ts` (new - WhatsApp follow-up helpers)
- `apps/admin/src/components/layout/nav.tsx` (add "Minat Booking" item, roles manager/admin)
- `apps/admin/src/routeTree.gen.ts` (route registration - see implementation notes)

Documentation:

- `docs/17-booking-leads/BOOKING_LEAD_ADMIN_UI.md`
- `docs/README.md`

## Implementation Notes

- `routeTree.gen.ts` is normally generated by the TanStack Router plugin; it was updated manually because no terminal was available. The next `dev`/`build` run regenerates it from the route files and the regenerated output wins (same approach as M16E).
- The mobile `BottomNav` shows the first 5 visible nav items; inserting "Minat Booking" after "Kamar" changes the bottom-nav composition for manager/admin (Komplain moves out of the first 5). Flag this in M17C-QA browser review for a product decision on ordering.
- Status labels, category/gender labels, and the transition map are exported from `useBookingLeads.ts` as the single frontend source for this copy.

## Deferred

- Public `/kamar` "Ajukan Minat Booking" lead form UI (next milestone; WhatsApp CTA remains the primary public channel).
- Date-range filter UI and server-side search UI.
- Lead detail page/drawer (row content is sufficient for MVP).
- Pagination UI beyond `limit: 100`.
- Manual admin lead entry (`whatsapp_manual` source) - not part of the M17B contract.
- Lead assignment, notification automation, CRM pipeline features, automatic expiry.
- Online booking payment (separate gated track; Payment Gateway posture unchanged).

## Validation Deferred Note

Claude Fable 5 did not run lint/build/browser/API validation. Validation is deferred to M17C-QA Codex.

## Verdict

PASS - implementation complete per the M17A freeze and M17B backend contract. Admin `/booking-leads` renders the property-scoped lead inbox with filters, guarded status transitions (Dikonversi as manual marker only), and WhatsApp follow-up. No reservation/invoice/occupancy/resident automation, no exact room numbers, no Payment Gateway or Smart Lock changes. Public booking remains **NOT production-ready**. Technical validation (lint, typecheck, build, browser smoke, API smoke) is deferred to M17C-QA.
