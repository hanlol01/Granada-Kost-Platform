# M17D-QA - Public /kamar Lead Form Validation

> Date: 2026-07-08
> Branch: `m17d-qa-public-form-validation`
> Commit: not captured (`git rev-parse --short HEAD` was blocked by sandbox during QA)
> Verdict: PASS with browser limitation

## Scope

This QA validates the M17D public `/kamar` booking lead form against the M17A safety freeze and the M17B public booking lead API contract.

Validation/fix only. No Payment Gateway, Smart Lock, room inventory backend, admin booking lead UI, payment booking, invoice/payment/occupancy/resident automation, CSV import/backfill, room ID exposure, `room_code` exposure, exact room number exposure, or production-ready public booking claim was introduced.

## Git / Change Summary

- Current branch: `m17d-qa-public-form-validation`
- Initial git status: clean
- QA source change: formatting-only Prettier fix in `apps/penghuni/src/components/booking-lead/PublicBookingLeadDialog.tsx`
- QA documentation created: `docs/17-booking-leads/BOOKING_LEAD_PUBLIC_FORM_UI_QA.md`
- No commit was created.

## Static Validation

| Command | Result |
| --- | --- |
| `npm --workspace @granada-kost/penghuni run lint` | Initial FAIL on 3 Prettier errors in `PublicBookingLeadDialog.tsx`; PASS after targeted formatting-only fix. Remaining 10 warnings are existing non-blocking baseline warnings. |
| `npm --workspace @granada-kost/penghuni run typecheck` | PASS |
| `npm --workspace @granada-kost/penghuni run build` | PASS; `/kamar` bundle builds successfully |
| `npm --workspace @granada-kost/api run build` | PASS |

## API Smoke

Fresh built API was started on port `3001`.

| Check | Result |
| --- | --- |
| `GET /api/v1/health` | PASS, HTTP 200 |
| Valid `POST /api/v1/public/booking-leads` | PASS, HTTP 201 |
| Duplicate valid payload within duplicate window | PASS, HTTP 201 with the same lead id |
| Invalid category payload | PASS, HTTP 400 |
| Invalid gender payload | PASS, HTTP 400 |
| Payload containing `roomId` / `roomCode` | PASS, HTTP 400 |

Intentional QA booking lead created:

- `80233901-2f07-4529-bb7a-3fe6d48b9379`
- Status: `new`
- Category/gender: `rukost` / `male`

Duplicate POST returned the same lead id, confirming no duplicate lead row was created for the repeated QA payload. The valid public response returned only safe acknowledgement fields: id, status, category, gender, createdAt, and message; it did not echo visitor name, phone, message, payment data, Smart Lock data, or exact room data.

## Public Route Result

Static/build inspection confirms:

- `/kamar` route exists in `apps/penghuni/src/routes/kamar.tsx`.
- `/kamar` is registered in `apps/penghuni/src/routeTree.gen.ts`.
- `/kamar` remains in `PUBLIC_ROUTES` in `apps/penghuni/src/routes/__root.tsx`, so it renders outside `AuthGuard`.
- Public lead submission uses anonymous API options and cannot trigger login or refresh-token loops.
- `Ajukan Minat Booking` appears on availability cards.
- Existing `Tanya Ketersediaan via WhatsApp` CTA remains available.

Browser visual QA and screenshots were not performed in this pass; validation used static inspection, successful build, and API smoke.

## Dialog / Form Behavior Result

Static inspection confirms:

- Dialog title: `Ajukan Minat Booking`
- Subtitle says admin will contact the visitor for availability confirmation.
- Selected group summary shows public-safe data only: `publicTitle`, building/floor label when present, category label, gender label, available count, and price.
- Required fields: `Nama Lengkap`, `Nomor WhatsApp`
- Optional fields: `Tanggal Rencana Masuk`, `Catatan untuk Admin`
- Honeypot field exists and short-circuits to fake success without API call when filled.
- Message max length is 1000 characters with a counter.
- Submit loading/disabled state exists.
- Double-submit guard exists (`mutation.isPending || submitted`).
- PII state is cleared whenever the dialog closes.

## Payload Safety Result

Frontend payload sends only:

- `category`
- `gender`
- `buildingCode` when present
- `floorCode` only when `A` or `B`
- `publicGroupKey` when present
- `visitorName`
- `visitorPhone`
- `visitorMessage` when present
- `preferredMoveInDate` when present

Static inspection confirms the frontend does not construct or send `roomId`, `room_code`, `roomCode`, exact room number, `propertyId`, payment fields, invoice fields, occupancy/resident fields, or Smart Lock fields.

## Anonymous POST Result

`usePublicBookingLead.ts` calls `apiClient.post("/public/booking-leads", input, { anonymous: true })`.

`packages/api-client/src/index.ts` confirms `anonymous: true` skips Authorization header injection and bypasses the 401 refresh flow. Therefore `/kamar` public lead submission cannot trigger login or refresh-token loops.

## Success / Error / WhatsApp Result

Static inspection confirms:

- Success title: `Minat booking berhasil dikirim.`
- Success subcopy says the submission is not an official booking yet.
- Success actions: `Hubungi Admin via WhatsApp` when `VITE_PUBLIC_WHATSAPP_NUMBER` is configured, plus `Lihat Kamar Lain`.
- Missing/unusable `VITE_PUBLIC_WHATSAPP_NUMBER` safely hides the post-submit WhatsApp button and keeps page-level disabled WhatsApp CTA copy.
- WhatsApp follow-up message includes visitor name, category, gender, unit/type public title, and preferred date or `-`.
- WhatsApp follow-up message does not include exact room number, room id, room code, payment data, or Smart Lock data.
- Rate limit / duplicate copy is generic and safe.
- Raw backend errors are not shown in the public UI.

## Privacy / Safety Result

Static and API inspection confirms:

- No exact room numbers exposed by the public UI.
- No room IDs or `room_code` exposed by the public UI.
- Valid public POST response does not echo tenant/resident/occupancy PII or visitor PII.
- No Payment Gateway data is used.
- No Smart Lock data is used.
- No production-ready public booking claim is present.
- No document/upload/payment fields exist in the public form.
- No lead id is displayed in the success UI.
- No backend/admin UI changes were made by QA.

The API intentionally rejects malicious payloads containing `roomId` / `roomCode` with HTTP 400. The validation error response names the rejected fields, but the public UI does not expose raw backend errors.

## Known Issues / Limitations

- Browser visual smoke and screenshots were not performed in this QA pass; coverage is static/build/API smoke.
- Commit hash was not captured because `git rev-parse --short HEAD` was blocked by the sandbox.
- One QA booking lead row was intentionally created by the public POST smoke.

## Verdict

PASS with browser limitation. M17D public `/kamar` lead form passes static validation, build validation, anonymous API smoke, duplicate protection smoke, payload safety inspection, success/error/WhatsApp inspection, and privacy/safety inspection. Public booking remains NOT production-ready; admin/WhatsApp confirmation remains authoritative.
