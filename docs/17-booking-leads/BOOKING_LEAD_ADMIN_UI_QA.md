# M17C-QA - Admin Booking Lead Management UI Validation

> Date: 2026-07-08
> Branch: `m17c-qa-admin-ui-validation`
> Commit: not captured (`git rev-parse --short HEAD` was blocked by sandbox/reviewer during QA)
> Verdict: PASS with browser limitation

## Scope

This QA validates the M17C Admin Booking Lead Management UI against the M17A architecture freeze and M17B backend contract.

Validation/fix only. No Payment Gateway logic, Smart Lock logic, room inventory/public room listing API, public `/kamar` lead form, invoice/payment/occupancy/resident automation, CSV import/backfill, or production-ready public booking claim was introduced.

## Git / Change Summary

- Current branch: `m17c-qa-admin-ui-validation`
- Initial git status: clean
- QA source change: formatting-only Prettier fix in `apps/admin/src/routes/booking-leads.tsx`
- QA documentation created: `docs/17-booking-leads/BOOKING_LEAD_ADMIN_UI_QA.md`
- No commit was created.

## Static Validation

| Command | Result |
| --- | --- |
| `npm --workspace @granada-kost/admin run lint` | PASS after formatting-only fix; 15 existing non-blocking baseline warnings |
| `npm --workspace @granada-kost/admin run typecheck` | PASS |
| `npm --workspace @granada-kost/admin run build` | PASS; `/booking-leads` route included in build |
| `npm --workspace @granada-kost/api run lint` | PASS |
| `npm --workspace @granada-kost/api run build` | PASS |

`routeTree.gen.ts` includes `/booking-leads`, and the admin build completed successfully.

## Backend API Smoke

Fresh built API was started on port `3001`.

| Check | Result |
| --- | --- |
| `GET /api/v1/health` | PASS, HTTP 200 |
| Unauthenticated `GET /api/v1/booking-leads` | PASS, HTTP 401 |
| Admin authenticated `GET /api/v1/booking-leads` | PASS, HTTP 200 |
| Admin authenticated valid `PATCH /api/v1/booking-leads/:leadId/status` | PASS, HTTP 200 |
| Invalid status `PATCH` with `paid` | PASS, HTTP 400 |
| Property-owner authenticated `GET /api/v1/booking-leads` | PASS, HTTP 403 |

The smoke reused existing QA lead `23d7c2a6-ff90-4742-a90d-720edba38fec`. Its status was moved from `contacted` to `visit_scheduled` for the valid PATCH check. No new booking lead record was created.

Expected auth/session side effects from dev logins occurred. No room inventory, invoice, payment, occupancy, resident, Payment Gateway, or Smart Lock mutation was performed.

## Route / Navigation Result

- `/booking-leads` route exists in `apps/admin/src/routes/booking-leads.tsx`.
- `apps/admin/src/routeTree.gen.ts` registers `/booking-leads`.
- Sidebar navigation contains `Minat Booking` with `Inbox` icon.
- Nav roles are `manager` and `admin`, matching backend authorization; property-owner is hidden in frontend nav and denied by backend smoke.
- The route is inside the authenticated admin app surface via the existing `AppShell` and shared admin auth/API patterns.

## UI Behavior Result

Static inspection confirms:

- Page title: `Minat Booking`
- Subtitle states leads are not official bookings until admin confirmation.
- Safety badges are present:
  - `Belum otomatis reservasi kamar`
  - `Tidak membuat invoice`
  - `Konfirmasi tetap via admin/WhatsApp`
- Desktop table exists.
- Mobile card list exists.
- Loading skeleton exists.
- Empty state exists: `Belum ada minat booking.`
- Filtered empty state exists.
- Error state exists: `Data minat booking belum dapat dimuat.`
- Displayed fields include visitor name, phone, message, category/gender labels, building/floor codes, preferred move-in date, status, source, created date, and updated date.

Browser visual QA and screenshots were not performed in this pass; validation used static inspection, successful build, and API smoke.

## Status Update Result

Allowed statuses are implemented:

- `new`
- `contacted`
- `visit_scheduled`
- `converted`
- `rejected`
- `expired`

Indonesian labels are implemented:

- `Baru`
- `Sudah Dihubungi`
- `Jadwal Survey`
- `Dikonversi`
- `Ditolak`
- `Kedaluwarsa`

The frontend transition map mirrors the M17B state machine for UX convenience, while backend remains authoritative. `converted` copy explicitly states it is a manual marker only and does not create penghuni/resident, occupancy, invoice, or room reservation. The mutation uses an idempotency key and invalidates `["booking-leads"]` queries after success.

## WhatsApp Follow-up Result

- `Hubungi via WhatsApp` action exists on desktop; compact `WhatsApp` action exists on mobile.
- `normalizeWhatsAppPhone()` strips non-digits and converts a leading `0` to `62`.
- Invalid or too-short numbers do not generate a `wa.me` URL.
- The prefilled message includes visitor name, category, gender, and preferred move-in date or `-`.
- The message does not include exact room number, room id, room code, payment data, or Smart Lock data.
- Links open in a new tab with `rel="noopener noreferrer"`.

## BottomNav Finding

`nav.tsx` builds successfully and has no duplicate/conflicting route. Adding `Minat Booking` directly after `Kamar` changes the first-five mobile BottomNav composition for manager/admin because BottomNav uses `useVisibleNavItems().slice(0, 5)`. This is not a functional blocker, but it remains a product/UX ordering decision for a later pass.

## Privacy / Safety Result

Static inspection confirms:

- `visitorMessage` is rendered as React text, not HTML; no `dangerouslySetInnerHTML` is used.
- No manual `console`/logger PII logging was found in the M17C UI files.
- Admin UI does not request or display Payment Gateway data, Smart Lock data, room IDs, exact room numbers, import notes, or source rows.
- Terms such as invoice/payment/occupancy/resident appear only in safety copy/comments stating these actions are not performed.
- No automatic reservation, invoice, occupancy, resident, payment, or Smart Lock flow is called by the M17C UI.
- Public booking remains NOT production-ready.

## Known Issues / Limitations

- Browser visual smoke and screenshots were not performed in this QA pass; coverage is static/build/API smoke.
- Commit hash was not captured because `git rev-parse --short HEAD` was blocked by the sandbox/reviewer.
- Mobile BottomNav ordering changed for manager/admin as noted above; not a blocker.

## Verdict

PASS with browser limitation. M17C Admin Booking Lead Management UI passes static validation, build validation, backend API smoke, RBAC smoke, status transition smoke, WhatsApp helper inspection, and safety/privacy inspection. No Payment Gateway or Smart Lock logic was changed, and no booking automation was introduced.
