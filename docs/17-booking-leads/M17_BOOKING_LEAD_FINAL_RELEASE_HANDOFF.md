# M17E - Final Booking Lead Release / Handoff

> Milestone: M17E - Final Booking Lead Release / Handoff
> Date: 2026-07-08
> Verdict: track M17 Booking Lead MVP CLOSED - Booking Lead MVP READY for internal/demo/staging use with admin/manual confirmation; public booking NOT production-ready
> Scope: Documentation/release update only. No backend code changes, no frontend code changes, no database migration, no Payment Gateway changes, no Smart Lock changes, no booking payment implementation, no exact room selection, no production-ready public booking claim.

## 1. Milestone Summary

| Milestone | Deliverable | Result |
| --- | --- | --- |
| M17A | Booking Lead MVP Architecture / UX / Safety Freeze (`BOOKING_LEAD_MVP_ARCHITECTURE_FREEZE.md`) | FROZEN, binding: lead is NOT a confirmed booking; no auto reservation, no payment, no invoice, no occupancy/resident creation, no exact room selection; WhatsApp/admin confirmation remains required; PII minimum and admin-only |
| M17B | Booking Lead Backend API (`BOOKING_LEAD_BACKEND_API.md`) | PASS: additive `booking_leads` migration (014), `POST /api/v1/public/booking-leads` (public write-only, Redis rate limit 5/15 min/IP, duplicate protection), `GET /api/v1/booking-leads` + `PATCH /api/v1/booking-leads/:id/status` (JWT + RBAC manager/admin, property-scoped), audit payload masked/PII-safe; lint/build/migrate/smoke PASS |
| M17C | Admin Booking Lead Management UI (`BOOKING_LEAD_ADMIN_UI.md` + `BOOKING_LEAD_ADMIN_UI_QA.md`) | PASS with browser limitation: `/booking-leads` page + nav "Minat Booking", lead list/filters/status update, WhatsApp follow-up; no auto resident/occupancy/invoice/payment flow |
| M17D | Public /kamar Lead Form Enhancement (`BOOKING_LEAD_PUBLIC_FORM_UI.md` + `BOOKING_LEAD_PUBLIC_FORM_UI_QA.md`) | PASS with browser limitation: "Ajukan Minat Booking" CTA + public lead form dialog, anonymous `POST /public/booking-leads` (no auth header, no refresh-token flow), success state states it is not a confirmed booking, WhatsApp follow-up remains available, payload excludes roomId/roomCode/exact room number/propertyId |
| M17E | Final release / handoff (this document) | Documentation only |

Milestone label drift note (carried from M17D): the M17A freeze planned the milestones as M17B backend foundation, M17C public endpoint, M17D admin UI, M17E public form, M17F QA, M17G handoff. Actual execution merged/reordered: M17B delivered the full backend (foundation + public endpoint + admin API), M17C delivered the Admin UI, M17D delivered the public form, and this handoff closes the track as M17E. Prior milestones are not renamed; code behavior matches the frozen M17A rules regardless of label.

## 2. Delivered Capabilities

- Public visitors on `/kamar` (no login) can submit booking interest leads per aggregated availability group via the "Ajukan Minat Booking" dialog (name + WhatsApp phone required; move-in date + note optional; honeypot anti-spam; PII cleared on dialog close).
- Anonymous, write-only public API: rate-limited, duplicate-protected, rejects unknown fields (including `roomId`/`roomCode`), returns a safe acknowledgment only (no PII echo, no property ID, no room data).
- Admins/managers manage leads at `/booking-leads` ("Minat Booking"): property-scoped list, status/category/gender/date/search filters, guarded status transitions (Baru -> Sudah Dihubungi -> Jadwal Survey -> Dikonversi; Ditolak/Kedaluwarsa; terminal states locked), WhatsApp follow-up deep link.
- "Dikonversi" is a manual marker only; actual resident/occupancy creation uses existing manual admin flows.
- Existing WhatsApp CTA "Tanya Ketersediaan via WhatsApp" unchanged and remains the primary confirmation channel; post-submit "Hubungi Admin via WhatsApp" follow-up uses `VITE_PUBLIC_WHATSAPP_NUMBER`.
- Audit events for public lead creation (masked phone, no message) and admin status updates (lead ID + transition only).

## 3. End-to-End Flow

1. Visitor opens `/kamar` (unauthenticated), filters Putra/Putri and category, sees aggregated availability cards (no exact room numbers).
2. Visitor clicks "Ajukan Minat Booking" on a card; the dialog shows the read-only public-safe group summary and the lead form.
3. Submit calls `POST /api/v1/public/booking-leads` anonymously (no Authorization header; no refresh-token flow). Backend validates, rate-limits, dedupes, stores the lead (`status=new`, `source=public_kamar`), writes a masked audit event.
4. Visitor sees "Minat booking berhasil dikirim." with explicit copy that this is not an official booking; optional WhatsApp follow-up opens `wa.me` with a public-safe template.
5. Admin sees the lead in `/booking-leads`, contacts the visitor via WhatsApp, and moves the status along the frozen transitions.
6. If the visitor proceeds, the admin performs the actual booking/resident/occupancy steps through existing manual flows and marks the lead `converted` (manual marker only). Rejected/stale leads are marked `rejected`/`expired`.

At no point does a lead reserve a room, change room status, create an invoice/occupancy/resident, or touch Payment Gateway or Smart Lock.

## 4. Validation Summary

| Track | Coverage | Result |
| --- | --- | --- |
| M17B backend | API lint/build, migration apply + idempotent rerun, fresh built API smoke (valid/invalid payloads, unknown-field rejection, duplicate protection, auth 401/403, status transitions), DB safety counts (rooms/residents/occupancies/invoices/payments/smart locks unchanged) | PASS |
| M17C-QA admin UI | Admin lint/typecheck/build, API lint/build, backend smoke (admin 200, invalid status 400, unauth 401, property-owner 403) | PASS with browser limitation |
| M17D-QA public form | Penghuni lint/typecheck/build, API build, public endpoint smoke (201, duplicate same-id, invalid payloads 400, `roomId`/`roomCode` 400), static route/payload/anonymous-POST/privacy inspection | PASS with browser limitation |
| M17E (this doc) | None - documentation only | N/A |

## 5. Accepted Browser Limitation Notes

- Browser visual/screenshot QA was skipped for M17C and M17D because browser tooling was not available; coverage was static inspection, build validation, and API smoke.
- This mirrors the accepted M16C/M16E limitation. The first visual demo doubles as a visual sanity check; schedule browser visual QA (M16C/M16E/M17C/M17D) when tooling is available.
- Accepted as a known limitation, not a release blocker for internal/demo/staging.

## 6. Safety / Privacy Summary

- A booking lead is an expression of interest only - never a confirmed booking, reservation, payment, invoice, occupancy, or resident record.
- Public catalog remains aggregated by hunian/unit/group: no exact room numbers, no room IDs, no `room_code` anywhere on public surfaces (request or response); the public payload rejects such fields.
- Minimum PII (visitor name, normalized phone, optional note/date); no identity documents, no uploads, no payment fields; PII readable only via authenticated, RBAC-gated, property-scoped admin endpoints.
- Public responses never echo visitor message/PII or internal data; audit payloads use masked phone only; frontend clears form PII on dialog close and never persists it.
- Anonymous public POST sends no Authorization header and cannot trigger login/refresh-token loops.
- Rate limiting (Redis), duplicate protection, bounded lengths, unknown-field rejection, and honeypot (UX-side) protect against abuse; backend remains the enforcement point.
- No Payment Gateway code paths touched (posture unchanged: sandbox/staging only, production activation pending). No Smart Lock changes (live command NO-GO, site trial pending).
- Retention/anonymization recommendation for terminal leads (90-180 days, per M17A Section 9) is documented but not yet automated; confirm before any production consideration.

## 7. Deployment / Config Notes

- Database: migration `backend/api/src/infrastructure/database/migrations/014_booking_leads.sql` must be applied (`npm --workspace @granada-kost/api run db:migrate`); rerun-safe.
- Redis: required for the public lead rate limiter (5 requests / 15 minutes / IP bucket).
- No new environment variables. `VITE_PUBLIC_WHATSAPP_NUMBER` is reused for the post-submit WhatsApp follow-up; empty/unusable value safely hides the follow-up button and renders the disabled CTA state (existing M16E behavior).
- No ApiClient changes (`anonymous: true` already supported for POST; `packages/api-client` remains frozen per ADR-FE-001).
- Admin access requires roles manager/admin with `room.read` (list) / `room.manage` (status update); property scoping mandatory.
- No Payment Gateway or Smart Lock env/config changes; keep `SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`.

## 8. Deferred Scope (Not in M17)

- Online booking payment / Payment Gateway booking integration (production booking activation not active).
- Room reservation automation; lead status never mutates room status.
- Exact room detail or exact room selection by public visitors.
- Photos/gallery, facilities catalog, policies/rules, pricing explanation pages, FAQ, SEO/public copy, detail catalog (recommended for M18).
- Resident account auto-creation from leads; document upload; staff assignment; notification automation (WhatsApp API/push/email); CRM features (scoring, reminders, funnels, analytics).
- Automatic lead expiry job and automated PII retention/anonymization (manual `expired` transition in MVP).
- Public lead status tracking/lookup.

## 9. Next Recommended Milestone

**M18 - Public Hunian Catalog Detail / Modern Listing**, focused on:

- Modern public catalog design.
- Hunian/unit-level detail pages - not exact room numbers.
- Photos/gallery.
- Facilities.
- Policies/rules.
- Pricing explanation.
- FAQ.
- SEO/public copy.
- WhatsApp/lead CTA integration (reusing the M17 lead form and CTA patterns).
- No payment gateway booking yet.

Alternative tracks remain valid per product decision: production hardening, Smart Lock real site trial (M13F-C5), payment production activation readiness, or CCTV planning.

## 10. Release Verdict

- Internal/demo/staging readiness: **READY with known limitations.**
- Production public booking readiness: **NOT READY.**
- Booking Lead MVP: **READY for internal/demo/staging use with admin/manual confirmation.**
- Payment booking: **DEFERRED.**
- Smart Lock live command: **NO-GO until site trial/evidence/signoff.**

Admin confirmation remains the source of truth for any actual booking; WhatsApp remains the primary confirmation channel.

## 11. Validation Deferred Note

Claude Fable 5 did not run lint/build/API/browser validation for this milestone. M17E is documentation/release update only; all recorded validation results are from the external/QA executions documented in the M17B-M17D milestone and QA documents.
