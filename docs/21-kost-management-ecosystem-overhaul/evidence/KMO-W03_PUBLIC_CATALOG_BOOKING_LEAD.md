# KMO-W03 Public Catalog and Booking Lead

Status: **KMO-W03-PUBLIC — AUTOMATED VERIFIED; RUNTIME DEFERRED**

The public catalog now exposes only published, category-level Rumah Kost and
Apart Kost projections. Availability, commercial values, payment schedules,
DP minimum, security-deposit rule, facilities, gallery derivatives, and terms
are read from server authorities; room, building, resident, hold, lease,
payment, and internal identifiers are not public output.

`POST /api/v1/public/booking-leads` accepts a bounded contact form with name,
email, Indonesian phone, gender, category, required university/education,
optional message, and
explicit contact consent. The server resolves property and category context,
normalizes the phone, applies rate limiting and duplicate/idempotency handling,
and returns a safe reference. A lead is not a reservation, hold, lease,
occupancy, invoice, payment, or room mutation.

Migration 024 is additive and ledger-addressed for email, consent version/time,
and legacy-compatible public contact validation.
First-apply, immediate replay, and transactional rollback were verified in a
disposable PostgreSQL harness. Migration 024 was then applied to the backed-up
canonical development database on 2026-08-01 and full-manifest replay made zero
writes. Public catalog and authenticated Admin lead reads return HTTP 200;
browser mutation evidence remains deferred.
