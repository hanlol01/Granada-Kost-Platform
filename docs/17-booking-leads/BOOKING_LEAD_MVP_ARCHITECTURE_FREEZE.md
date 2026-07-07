# M17A - Booking Lead MVP Architecture / UX / Safety Freeze

> Milestone: M17A - Booking Lead MVP Architecture / UX / Safety Freeze
> Date: 2026-07-07
> Verdict: FROZEN (binding for M17B and later milestones)
> Scope: Documentation/freeze only. No application source code changes, no migration files, no seed, no CSV import/backfill, no QA execution, no Payment Gateway changes, no Smart Lock changes.
> Binding statement: **Public booking is NOT production-ready. Booking Lead MVP is a staging/demo track first.**

## 1. Purpose / Goal

M17 allows public visitors to submit booking interest (a "lead") safely from the public `/kamar` listing, and allows admins to manage and follow up leads. This document freezes the product rules, data model concept, public/admin UX flows, API concept, and safety/privacy rules before any implementation begins.

A booking lead is an expression of interest only. It is **not** a confirmed booking and it does **not** change room inventory state.

## 2. Binding Postures Carried Forward (Unchanged)

| Area | Posture |
| --- | --- |
| Public booking | **NOT production-ready.** M17 remains a staging/demo track. |
| Online booking payment | **DEFERRED / NOT production activated.** No Payment Gateway involvement in booking. |
| Payment Gateway | Sandbox/staging ready only (M15C). **Untouched by M17.** |
| Smart Lock | Live command **NO-GO** until site trial/evidence/signoff (M13F-D). **Untouched by M17.** |
| WhatsApp | Remains the **primary confirmation channel**. The lead form is additive, not a replacement. |
| Browser visual QA M16C/M16E | Pending; carried forward as a **known limitation, not an M17A blocker**. |
| Production overall | NOT READY (M14F verdict unchanged). |

## 3. Product Rules (Frozen, Binding)

1. A booking lead is **not a confirmed booking**.
2. A booking lead does **not reserve a room automatically**. No room status mutation is triggered by lead creation or lead status changes in MVP.
3. **No online payment** and no Payment Gateway involvement.
4. **No invoice generation** from leads.
5. **No automatic occupancy creation** from leads.
6. **No exact room selection by public visitors.** Interest is captured at the aggregated group level only (category/gender/building/floor), consistent with the M16A public listing freeze.
7. **No automatic resident account creation** from leads.
8. **Admin confirmation remains required** for any actual booking; the admin remains the sole authority for exact room assignment.
9. **WhatsApp follow-up remains available** and primary; the existing WhatsApp CTA on `/kamar` is unchanged.
10. **Backend enforces all safety and validation.** Frontend validation is UX-only (binding architecture principle).
11. The PII handling rules in Section 9 are **binding freeze content**, not implementation-time decisions.

## 4. Data Model Freeze - `booking_leads`

Conceptual table (additive migration in M17B; PostgreSQL is the system of record):

| Field | Notes |
| --- | --- |
| `id` | UUID primary key |
| `property_id` | FK, NOT NULL; property scoping is mandatory |
| `category` | CHECK: `rukost` \| `apartkost` |
| `gender` | CHECK: `male` \| `female` (public UI uses putra/putri labels; mapping identical to M16D) |
| `building_code` | Nullable (aggregated interest only) |
| `floor_code` | Nullable |
| `public_group_key` | Nullable; snapshot of the M16D group key the visitor viewed (e.g. `rukost-male-01-A`) |
| `visitor_name` | Required; bounded length; PII (backend-only, never public) |
| `visitor_phone` | Required; normalized digits (leading `0` to `62`, same normalization family as the WhatsApp CTA helper); bounded length; PII |
| `visitor_message` | Nullable; bounded length; sanitized; PII-adjacent free text |
| `preferred_move_in_date` | Nullable date |
| `status` | CHECK: `new` \| `contacted` \| `visit_scheduled` \| `converted` \| `rejected` \| `expired`; default `new` |
| `source` | CHECK constrained; MVP value: `public_kamar` |
| `metadata` | Nullable JSON; **safe fields only** (e.g. filter snapshot, rate-limit bucket reference); never raw IP, never PII duplication, never room IDs |
| `created_at` / `updated_at` | Timestamps |

**Explicitly excluded from the MVP model (frozen):**

- Exact room number / room ID / `room_code`.
- Payment status or any payment fields.
- `invoice_id` (excluded in MVP).
- `occupancy_id` (excluded in MVP).
- Smart Lock data of any kind.
- Sensitive identity documents (KTP/passport numbers, document uploads, images).

## 5. Status Model (Frozen)

| Status | Meaning |
| --- | --- |
| `new` | Lead submitted; not yet handled |
| `contacted` | Admin has contacted the visitor (typically via WhatsApp) |
| `visit_scheduled` | A viewing/visit has been arranged |
| `converted` | Visitor became a real booking/resident through the existing **manual** admin flows |
| `rejected` | Lead declined/not proceeding (spam, no fit, visitor declined) |
| `expired` | Lead went stale without conclusion |

Transition rules (backend-enforced in M17B+):

- Forward path: `new` -> `contacted` -> `visit_scheduled` -> `converted`.
- `rejected` and `expired` are allowed from any non-terminal status.
- `converted`, `rejected`, and `expired` are terminal in MVP.
- Conversion is a **manual admin action only**; it does not create occupancy, invoice, or resident records automatically. Actual resident/occupancy creation uses the existing admin flows and is deferred from lead automation.
- Status changes are admin-authenticated and audited. Public visitors can never read or change lead status.

## 6. Public Visitor Flow (Frozen UX)

1. Visitor opens `/kamar` (unauthenticated, unchanged).
2. Filters by gender (Putra/Putri) and category (unchanged M16E behavior).
3. Sees aggregated availability group cards (no exact room numbers, unchanged).
4. Each card offers two actions: **"Ajukan Minat Booking"** (new, opens the lead form) and the existing **WhatsApp CTA** (unchanged, primary channel).
5. Lead form fields (lightweight, frozen): name (required), phone/WhatsApp (required), optional preferred move-in date, optional note. Interest context (category/gender/group) is auto-filled from the card and not editable as free text.
6. On submit, the system shows a simple success message (e.g. "Terima kasih, admin akan menghubungi Anda via WhatsApp.").
7. The visitor is still directed to WhatsApp/admin for confirmation. No lead ID, status tracking, or lookup is exposed publicly in MVP.

Failure states must be safe: generic error copy, no internal details, retry allowed within rate limits. If lead submission is unavailable, the WhatsApp CTA remains the fallback.

## 7. Admin Flow (Frozen UX)

1. Admin sees a lead list (completing the Ketersediaan/Booking surface deferred from M16C), property-scoped.
2. Filters: status, category, gender, date range.
3. Admin opens lead detail (full PII visible only here, behind auth + RBAC + property scope).
4. Admin can contact the visitor via WhatsApp (deep link from the stored normalized phone).
5. Admin updates status along the frozen transition rules, including marking `converted` or `rejected`; a rejection/cancellation note is recommended.
6. Conversion to resident/occupancy is **deferred or manual only**: the admin uses existing Rooms/Resident/Occupancy flows; the lead system only records the terminal `converted` status in MVP.

## 8. API Concept (Frozen)

### Public (unauthenticated)

- `POST /api/v1/public/booking-leads`
  - Validates all fields backend-side (required name/phone, enum category/gender, bounded lengths, date format).
  - Rate limited (Redis-backed, stricter than the M16D read endpoints).
  - Duplicate protection recommended: idempotency and/or duplicate-phone throttling within a time window.
  - No auth required; **write-only** - there is no public read, list, or status endpoint for leads.
  - Never reserves a room, never mutates inventory, never returns room IDs or internal data.
  - Response: generic success acknowledgment only.

### Admin (authenticated)

- `GET /api/v1/booking-leads` - list with status/category/gender/date filters; property-scoped; RBAC-gated.
- `PATCH /api/v1/booking-leads/:id/status` - status transition per Section 5; property-scoped; RBAC-gated.
- Audit events recommended for lead creation and every status transition (consistent with existing audit foundation).

## 9. Safety / Privacy Freeze (Binding)

This is the first public surface that **stores** visitor PII. The following rules are binding:

- **Rate limit public submissions** (Redis; per-IP/bucket; stricter than public read endpoints). Payload size caps enforced.
- **Validate phone** backend-side (normalized digits, minimum length); reject unusable contact data.
- **Reject spammy/empty payloads**: required-field validation, bounded lengths, and lightweight abuse checks (e.g. honeypot field and/or minimum-time heuristic) are acceptable MVP measures; no CAPTCHA dependency required.
- **Sanitize `visitor_message`**: bounded length, stored as plain text, rendered safely in Admin (no HTML interpretation).
- **Store only the minimum PII needed for follow-up**: name, phone, optional note/date. Nothing else.
- **Do not store sensitive identity documents** (no KTP/passport data, no document/image upload for public visitors in MVP).
- **Do not expose internal room IDs publicly** in any request or response; the public payload references only the aggregated group context.
- **No auto-reserve, no auto-invoice**: lead endpoints must not mutate rooms, occupancy, billing, invoices, or payments.
- **Do not touch Payment Gateway. Do not touch Smart Lock.** No shared code paths, no config changes, no data references.
- **Property scoping for admin** reads/writes is mandatory; resident/visitor self-scope does not exist for leads (visitors have no read access at all).
- **PII never leaks into logs, audit payloads, or error responses** beyond masked references (e.g. lead ID + masked phone).
- **Public write-only posture**: admin auth is the only read path for lead PII.
- **Retention/deletion recommendation**: define a retention policy at implementation time within these bounds - stale `new`/`contacted` leads should be transitionable to `expired` (manual in MVP; automation deferred), and a periodic PII cleanup/anonymization window (e.g. 90-180 days for terminal leads) should be documented in M17B and confirmed before any production consideration. Raw IPs must not be stored; if abuse tracking needs a key, store a hash/bucket only.

## 10. Deferred Scope (Not in M17 MVP)

- Online booking payment / Payment Gateway booking (separate gated track; only after production payment activation).
- Room reservation automation (lead status never mutates room status in MVP).
- Exact room selection by public visitors.
- Resident account auto-creation from leads.
- Document upload for public visitors.
- Lead assignment to specific staff members.
- Notification automation (WhatsApp API, push, email) for lead events; follow-up remains manual WhatsApp.
- Advanced CRM pipeline features (scoring, reminders, funnels, analytics dashboards).
- Automatic lead expiry job (manual `expired` transition in MVP; automation later).
- Public lead status tracking/lookup.

## 11. Recommended Implementation Milestones

| Milestone | Scope |
| --- | --- |
| M17B | Additive `booking_leads` migration + backend foundation (repository/service, status machine, audit events, retention policy documentation) |
| M17C | Public lead submission endpoint (write-only, rate-limited, validated, duplicate protection, PII-safe responses) |
| M17D | Admin lead management API + Admin UI (lead inbox, filters, detail, status transitions) |
| M17E | Public `/kamar` "Ajukan Minat Booking" form UI alongside the unchanged WhatsApp CTA, with safe fallback states |
| M17F | QA/validation track (external executor per DEVELOPMENT_WORKFLOW): API smoke incl. rate-limit and PII response safety scan, lint/typecheck/build; fold in pending M16C/M16E browser visual QA if tooling is available |
| M17G | Final docs / release update / handoff |

## 12. Acceptance Criteria Mapping

| Criterion | Status |
| --- | --- |
| Freeze doc created | Yes (this document) |
| MVP scope clear | Section 3, 4-8 |
| Deferred scope clear | Section 10 |
| Backend enforcement clear | Sections 3 (rule 10), 5, 8, 9 |
| Privacy/safety clear and binding | Section 9 |
| Public booking not production-ready clearly stated | Header + Section 2 |
| Smart Lock posture unchanged | Section 2 (NO-GO until site trial/evidence/signoff) |
| Payment Gateway posture unchanged | Section 2 (sandbox/staging only; payment booking deferred) |
| No production-ready overclaim | Confirmed throughout |
| No code changes | Confirmed - documentation only |
| No validation claim | Section 13 |

## 13. Validation Deferred Note

Claude Fable 5 did not run lint/build/API/browser validation for this milestone. M17A is documentation/freeze only; no application source code, migrations, seeds, or QA were executed. All implementation validation is deferred to the M17B-M17F milestones and external QA execution.

## 14. Verdict

**FROZEN.** The Booking Lead MVP product rules, data model concept, public/admin flows, API concept, and binding safety/privacy rules are frozen for M17B and later. A booking lead is not a confirmed booking; nothing in this track reserves rooms, creates invoices/occupancy, touches Payment Gateway, or touches Smart Lock. Public booking remains **NOT production-ready**; the Booking Lead MVP proceeds as a staging/demo track with WhatsApp/admin confirmation as the primary path.
