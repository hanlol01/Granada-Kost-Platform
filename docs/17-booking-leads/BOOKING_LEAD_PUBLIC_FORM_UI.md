# M17D - Public /kamar Booking Lead Form UI

> Milestone: M17D - Public /kamar Lead Form Enhancement
> Date: 2026-07-08
> Verdict: PASS (implementation complete; technical validation deferred to M17D-QA)
> Scope: Frontend public UI only. No backend changes, no ApiClient changes, no admin UI changes, no Payment Gateway, no Smart Lock, no invoice/occupancy/resident/reservation automation. Public booking remains NOT production-ready.

## Summary

M17D connects the public `/kamar` listing to the M17B public booking lead endpoint. Each availability card gains a primary **"Ajukan Minat Booking"** CTA that opens a lead form dialog; the existing **"Tanya Ketersediaan via WhatsApp"** CTA is kept as the secondary action and remains the primary confirmation channel per the M17A freeze. A booking lead is an expression of interest only: it is not a confirmed booking, it does not reserve a room, and it creates no invoice, occupancy, resident, or payment records.

## Route Enhanced

- `/kamar` in `apps/penghuni` (`apps/penghuni/src/routes/kamar.tsx`), unauthenticated via `PUBLIC_ROUTES` (unchanged). No new route was added; `routeTree.gen.ts` is untouched.

## Files Changed

- `apps/penghuni/src/routes/kamar.tsx` - primary "Ajukan Minat Booking" button per card (WhatsApp CTA restyled to secondary/outline, behavior unchanged), dialog wiring.
- `apps/penghuni/src/components/booking-lead/PublicBookingLeadDialog.tsx` (new) - lead form dialog: group summary, fields, validation, honeypot, submit/success/error states, WhatsApp follow-up.
- `apps/penghuni/src/hooks/usePublicBookingLead.ts` (new) - `createPublicBookingLead(payload)` + `useCreatePublicBookingLead()` mutation using the shared `ApiClient` with `anonymous: true`; UX-only phone sanity helper.
- `apps/penghuni/src/lib/whatsapp-cta.ts` - additive `buildLeadFollowUpMessage()` post-lead template.
- `docs/17-booking-leads/BOOKING_LEAD_PUBLIC_FORM_UI.md` (new) + `docs/README.md` (index update).

No backend files changed. No `packages/api-client` changes. No `packages/domain/src/env.ts` changes (no new env var; `VITE_PUBLIC_WHATSAPP_NUMBER` is reused as-is).

## API Consumed

- `POST /api/v1/public/booking-leads` (M17B), unauthenticated write-only.

Payload sent (public-safe group context + minimum PII only):

| Field | Source |
| --- | --- |
| `category` | card group (read-only) |
| `gender` | card group `male`/`female` (read-only; backend also accepts putra/putri) |
| `buildingCode` | card group, only when present |
| `floorCode` | card group, only when `A` or `B` |
| `publicGroupKey` | card group `groupKey`, only when present |
| `visitorName` | form input, trimmed |
| `visitorPhone` | form input, trimmed (backend normalizes) |
| `visitorMessage` | optional form input, trimmed, omitted when empty |
| `preferredMoveInDate` | optional native date input, `YYYY-MM-DD` |

Never sent: room ID, `room_code`, exact room number, `propertyId`, auth header, payment fields. The backend rejects unknown fields; the frontend never constructs them.

## Anonymous POST ApiClient Decision

Inspected `packages/api-client/src/index.ts` (frozen per ADR-FE-001): `anonymous` is a generic `RequestOptions` flag available to all verbs including `post()`. When `anonymous: true`:

1. `buildHeaders` skips the Authorization header entirely.
2. The 401 handler (`executeWithAuth`) skips the single-flight refresh-token flow.

Anonymous POST is therefore already fully supported. **No ApiClient change was made.** Public lead submission cannot trigger a login redirect or refresh-token loop, matching the proven M16E anonymous GET posture.

## Form UX

- Dialog title: "Ajukan Minat Booking"; subtitle: "Isi data singkat berikut. Admin akan menghubungi Anda untuk konfirmasi ketersediaan kamar."
- Read-only group summary: `publicTitle`, `buildingName`/`buildingCode`, `floorLabel`, `categoryLabel`, `genderLabel`, `availableCount`, monthly/yearly from-prices, plus "Nomor kamar akan dikonfirmasi oleh admin." No room IDs/room_code/exact room numbers. The interest context is not editable.
- Fields: **Nama Lengkap** (required), **Nomor WhatsApp** (required), **Tanggal Rencana Masuk** (optional, native date, min today), **Catatan untuk Admin** (optional, max 1000 chars with counter).
- No identity document field, no upload field, no payment field.
- Hidden honeypot field (lightweight anti-spam per M17A Section 9): if filled, the UI shows the success state without calling the API. Backend rate limiting/validation remain authoritative.

## Validation (UX-only; backend authoritative)

- Name: trimmed, 2-120 chars -> "Nama wajib diisi (2-120 karakter)."
- Phone: digits sanity check with `0`->`62` normalization family (same as the WhatsApp CTA helper), 9-15 digits -> "Masukkan nomor WhatsApp yang valid, contoh: 08123456789."
- Message: `maxLength` 1000 enforced by the textarea.
- Date: native `YYYY-MM-DD`; past dates discouraged via `min` (UX-only).

## Submit / Success / Error Behavior

- Submit calls the mutation; button shows a spinner + "Mengirim..." and is disabled while pending; a state guard prevents double submit.
- Success state: "Minat booking berhasil dikirim." with subcopy "Admin akan menghubungi Anda melalui WhatsApp untuk konfirmasi. Pengajuan ini belum menjadi booking resmi." plus the safety copy "Pengajuan minat booking belum mengunci kamar dan belum menjadi transaksi pembayaran. Admin akan mengonfirmasi ketersediaan terlebih dahulu." Actions: **Hubungi Admin via WhatsApp** (only when `VITE_PUBLIC_WHATSAPP_NUMBER` is configured) and **Lihat Kamar Lain** (closes the dialog). No lead ID or status is displayed (no public tracking in MVP).
- Duplicate submissions: the backend returns the same safe 201 response within its duplicate window, so duplicates land on the normal success state with no second row created.
- Rate limit (429 / `RATE_LIMITED`): "Pengajuan Anda sudah diterima atau terlalu sering dikirim. Silakan tunggu beberapa saat atau hubungi admin via WhatsApp."
- Validation (400 / `VALIDATION_FAILED`): "Periksa kembali data yang Anda isi, lalu coba lagi." (client-side field errors are shown inline before submit; API validation details are not echoed).
- All other errors: "Pengajuan belum dapat dikirim. Silakan coba lagi atau hubungi admin via WhatsApp." Raw backend errors are never exposed; the WhatsApp CTA remains the fallback.

## WhatsApp Follow-up

- The card CTA "Tanya Ketersediaan via WhatsApp" is unchanged (now visually secondary).
- After a successful lead submit, "Hubungi Admin via WhatsApp" opens `wa.me` using the existing `VITE_PUBLIC_WHATSAPP_NUMBER` behavior with the template:

```
Halo Admin Kostation, saya sudah mengajukan minat booking melalui website.
Nama: {visitorName}
Kategori: {categoryLabel}
Untuk: {genderLabel}
Unit/Tipe: {publicTitle}
Tanggal masuk: {preferredMoveInDate atau "-"}
Mohon dibantu konfirmasi ketersediaannya.
```

- When the env is missing/unusable, the follow-up button is not rendered; the success state remains valid and the existing page-level disabled-CTA notices apply.

## Privacy / Safety Rules

- Minimum PII only (name, phone, optional note/date); no identity documents, no uploads.
- Form state (PII) is cleared from component state whenever the dialog closes; nothing is persisted to localStorage/sessionStorage/URL.
- `visitorMessage` is never echoed back into the UI from the API response.
- No room IDs, `room_code`, or exact room numbers are sent or rendered anywhere.
- No login required; anonymous request sends no Authorization header and cannot trigger the refresh-token flow.
- No payment, invoice, occupancy, resident, or reservation creation locally or via the endpoint; no Payment Gateway or Smart Lock code paths touched.
- Footer disclaimer and lead-form safety copy keep stating that admin confirmation is required and there is no online payment for booking.

## Milestone Sequencing Drift Note

The M17A freeze planned the public form UI as **M17E** (with M17D = Admin lead management). In actual execution the admin UI shipped as M17C (with M17C-QA), and this public form ships as **M17D** per direction. Prior milestones are not renamed; code behavior matches the frozen M17A public visitor flow (Section 6) regardless of label.

## Deferred

- Public lead status tracking/lookup.
- Online booking payment / Payment Gateway booking integration.
- Room reservation automation and exact room selection.
- Resident auto-creation, document upload, staff assignment, notification automation, CRM features, automatic lead expiry.
- CAPTCHA (honeypot + backend rate limit are the MVP measures).
- API-validation-to-field mapping beyond generic copy (backend error details are intentionally not surfaced).

## Validation Deferred Note

Claude Fable 5 did not run lint/build/browser/API validation. Validation is deferred to M17D-QA Codex.

## Verdict

PASS - implementation complete. `/kamar` visitors can submit a booking interest lead without login through the anonymous write-only M17B endpoint, with safe success/error states, WhatsApp follow-up preserved, and all M17A safety/privacy rules upheld. Public booking remains **NOT production-ready**; WhatsApp/admin confirmation remains authoritative.
