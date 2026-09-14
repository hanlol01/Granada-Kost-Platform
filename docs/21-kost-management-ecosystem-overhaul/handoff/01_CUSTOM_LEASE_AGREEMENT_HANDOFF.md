# Handoff: custom lease duration and negotiated tariff

Status: **STAGE 1 AND STAGE 2 IMPLEMENTED LOCALLY — RELEASE EVIDENCE PENDING**

## Problem and outcome

Admin needs to record a 1- or 2-month lease and negotiated rates such as an
11-month agreement below the standard tier. The feature must remain one
commercial authority: every later payment, invoice, receipt, report, Owner view,
and settlement reads the exact agreement that was committed.

## Read first

- `docs/21-kost-management-ecosystem-overhaul/CONTEXT.md`
- `docs/adr/0001-custom-lease-agreement-authority.md`
- `OWNER_POLICY_DECISIONS_AND_GLOSSARY.md`
- `BILLING_REMINDER_NOTIFICATION_REPORTING.md`
- `DATA_MODEL_AND_MIGRATION.md`
- `ADMIN_INFORMATION_ARCHITECTURE.md`
- `API_AND_INTEGRATION_CONTRACT.md`
- current onboarding DTO/service and `LeaseCreatePage.tsx`

## Current implementation gaps

These are the known gaps at handoff time. Reconfirm them against current source
before editing; reuse any authority that has since been added:

- onboarding DTO and database constraints still reject terms below three months;
- paid booking/onboarding commitments still use the same three-month minimum;
- settlement policy `lease_settlement_v2` and its database constraints recognize
  only 3-, 6-, and 12-month terms and final offsets of two or three months;
- onboarding currently forces `annual_full`; it creates the contract-rent
  obligation, while the existing checkpoint authority cannot yet persist or
  project the generalized 1–120-month schedule;
- leases do not yet preserve separate reference-tariff, pricing-source, reason,
  actor, and agreement-time snapshots;
- several payment, report, document, Owner, and Penghuni consumers assume the
  existing duration-tier snapshot is always the complete pricing explanation.

Do not add a parallel pricing calculator to work around these gaps. Stage 1 must
establish the shared commercial authority; Stage 2 migrates every consumer to it.

## Commercial rules

1. The effective standard duration tiers in `POL-BILLING-001` remain the price
   authority and the default path. Resolve their current amounts from the
   effective category version rather than duplicating a constant in the feature.
2. A 3–120 month contract may use the standard tier or an explicit negotiated
   agreement.
3. A 1–2 month contract is available only through the negotiated agreement path.
   Its reference tariff is the effective 3–5 month tier for comparison only.
4. `Nilai Kontrak = tarif bulanan yang disepakati × durasi bulan`.
5. The agreed rate must be a positive safe integer and must remain above the
   applicable monthly Kostation Management Fee. A rate below the reference tariff
   is allowed with a required reason and explicit confirmation. A difference of
   15% or more in either direction requires a second acknowledgement showing the
   exact nominal and percentage difference; it does not silently change roles or
   approval authority.
6. Every negotiated agreement requires a reason, including a 1–2 month agreement
   whose agreed rate equals the reference rate. The reason is Admin-only
   operational context and is not exposed to Property Owner or Penghuni unless a
   later policy explicitly says so.
7. Booking, onboarding, renewal, transfer, and checkout use the same snapshot.
   A renewal or formal amendment creates a new snapshot; it never mutates the
   old contract.

## Snapshot contract and target schema

Keep the existing lease fields authoritative and add the missing comparison and
audit fields. This is the target mapping unless source review proves a stricter
existing authority:

| Contract fact    | Target authority                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| Duration         | Existing `leases.term_months`, constrained to 1–120.                                                               |
| Reference tier   | Existing `leases.snapshot_pricing_tier`; resolve 1–2 months to `short_stay` only as a negotiated comparison.       |
| Agreed tariff    | Existing `leases.snapshot_monthly_price`; current consumers continue reading the contractual rate from this field. |
| Contract value   | Existing `leases.contract_rent_amount`; server-enforced as agreed tariff multiplied by duration.                   |
| Reference tariff | Add immutable `snapshot_reference_monthly_price`.                                                                  |
| Pricing source   | Add `pricing_source` constrained to `standard` or `negotiated`.                                                    |
| Reason           | Add `pricing_agreement_reason`, required whenever source is `negotiated`.                                          |
| Actor/time       | Add `pricing_agreed_by_user_id` and `pricing_agreed_at`.                                                           |
| Accepted terms   | Preserve the linked accepted terms version and agreement evidence.                                                 |

Apply the same commercial facts to `onboarding_commitments` and paid booking
commitments that can later materialize a lease. Conversion copies the approved
snapshot. Repricing is permitted only when Admin explicitly changes room,
duration, or rate and reconfirms the displayed difference before commit.

Legacy leases must be treated as `standard` using their existing snapshot values;
backfill sets the reference tariff equal to the existing contractual snapshot and
must not infer a historical negotiation reason.

## Initial payment and deposit

The 25% value remains a recommendation/prefill under `POL-PAYMENT-001`, not a
blocking minimum. Financial activation requires verified rent credit of at least
`min(agreed monthly tariff, contract value)`. Therefore a one-month contract must
be fully paid before activation, while a longer contract must cover at least one
agreed month. An authorized Admin may record a lower payment, but that payment
does not satisfy activation readiness. Booking Fee and DP are rent credits.
Security Deposit is separate, optional, and never reduces contract rent.

All staged payments obey:

```text
contract value
− verified Booking Fee rent credit
− verified DP/installment/full-settlement rent credits
= remaining rent obligation
```

No payment entry may increase the total rent credit beyond contract value, and a
deposit entry never enters that equation.

## Settlement checkpoint schedule

The current settlement helper supports only 3, 6, and 12 months under immutable
policy `lease_settlement_v2`. Do not relabel or rewrite existing v2 snapshots.
Stage 1 adds `lease_settlement_v3` for newly committed agreements and extends the
existing `lease_settlement_policy_snapshots` and
`lease_settlement_checkpoints` authority additively. V3 uses this deterministic
1–120 month rule while preserving the current 3/6/12 outcomes:

| Term         | Checkpoints after contractual start                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1 month      | Full remaining balance is due at activation/start (`offset 0`).                                                           |
| 2 months     | Initial credit covers month 1; exact remaining balance is due at month 1.                                                 |
| 3 months     | Cumulative two-month coverage at month 1; exact remaining balance at month 2.                                             |
| 4–120 months | Cumulative two-month coverage at month 1, cumulative three-month coverage at month 2, exact remaining balance at month 3. |

For v3, final-settlement offsets are respectively `0`, `1`, `2`, or `3` for the
four rows above. A one- or two-month agreement has only a sequence-1
`final_settlement` checkpoint; the initial-month activation gate is stored in the
policy snapshot and is not duplicated as another checkpoint. Existing v2 rows,
constraints, projections, and behavior remain readable.

Use the agreed monthly snapshot for cumulative minimums. Preserve the
contractual start-day anchor when a later month is shorter. Booking Fee and
verified payments allocate oldest obligation first. A checkpoint is a cumulative
payment target and deadline, not a second charge, payment, or duplicate invoice.
The contract-rent obligation remains exactly the contract value; every checkpoint
projection must reconcile to that value without Rupiah rounding drift.

## Admin experience

Default form state remains standard pricing. Provide an explicit control such as
“Gunakan kesepakatan khusus” that reveals:

- duration in months (1–120);
- agreed monthly tariff;
- read-only reference tariff;
- read-only calculated contract value;
- nominal/percentage difference;
- required special-agreement reason;
- a confirmation summary before commit.

Show clear validation for missing reason, non-positive rate, rate at or below the
management fee, invalid duration, rent credits above contract value, and an
unsupported checkpoint result. On room selection or booking changes, recalculate
and show the difference before commit. Leaving special mode restores the standard
duration/rate quote only after confirmation if the Admin entered custom data.

## API and authorization

- The server resolves the effective tariff and validates the final commercial
  snapshot inside the commit transaction.
- Standard source requires agreed tariff equal to reference tariff and a null
  reason. Negotiated source requires a reason and permits equal/different tariffs;
  1–2 months requires negotiated source.
- Client-supplied totals are display proposals, never accepted authority.
- Only an in-scope Admin with lease/onboarding write permission can create a
  negotiated agreement.
- Read DTOs expose approved duration, agreed tariff, contract value, and pricing
  source. Negotiation reason is limited to the Admin permission boundary.
- Idempotency keys prevent duplicate commit or duplicate payment materialization.
- Every commercial change after commit is an append-only amendment with before /
  after values and reason; direct edits to issued documents are rejected.

## Consumers that must be updated together

| Surface                          | Required output                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Payments and invoices            | Duration, agreed monthly tariff, contract value, current payment, cumulative payment, remaining obligation, pricing-source label. |
| Receipts and contract-paid proof | Immutable commercial snapshot at issuance.                                                                                        |
| Admin reports/PDF/XLSX           | Reference tariff, agreed tariff, variance, duration, contract value; private reason only in Admin views.                          |
| Owner Portal                     | Contract target, paid, remaining, duration, agreed tariff, estimated fee/right; no private negotiation reason.                    |
| Penghuni                         | Approved duration, tariff, contract total, payment progress, and due dates.                                                       |
| Checkout                         | Earned rent, refund, and amount-due calculations use the agreed monthly snapshot.                                                 |

Keep these values distinct: contract target, verified cash, and earned income.
An annual contract paid in full is still earned over the service period.

## Migration and compatibility gate

1. Inspect the live ledger before selecting the migration number.
2. Additive migration only; preserve old columns and records until all consumers
   read the new authority.
3. Backfill legacy leases deterministically as `standard` from existing snapshot
   fields, with a migration audit count and checksum.
4. Prove first apply, replay, rollback, constraint behavior, and legacy read
   compatibility on a disposable PostgreSQL instance.
5. Never renumber a migration already present in production.

## Required RED and acceptance evidence

Tests must fail before implementation for at least:

- 1-, 2-, 3-, 11-, and 12-month agreements;
- standard and negotiated rates, including a lower negotiated rate with reason;
- missing reason, rate at/below fee, unsafe amount, invalid duration;
- booking fee plus multiple staged rent payments without over-credit;
- security deposit excluded from rent totals;
- old lease remains unchanged after tariff authority changes;
- the generalized checkpoint schedule preserves existing 3/6/12 behavior and
  covers every supported term without gaps;
- API/UI/report/document/Owner/Penghuni values reconcile exactly;
- idempotent commit and safe replay of the same key.

Stage 1 is complete only when the committed lease read model and audit snapshot
are correct. Stage 2 is complete only when every listed consumer uses that same
snapshot and focused tests pass.

## Local implementation evidence

The working-tree implementation now provides:

- one server-authoritative resolver for standard and negotiated agreements,
  including 1–2 month negotiated-only rules, management-fee safety, required
  Admin reason, and explicit acknowledgement for a variance of at least 15%;
- additive lease, onboarding commitment, and paid-booking commercial snapshots,
  with deterministic legacy standard backfill in migration `081`;
- settlement policy `lease_settlement_v3` for every integer duration from 1 to
  120 months while retaining legacy v2 interpretation;
- server-derived contract value and staged-payment reconciliation that keeps
  Booking Fee/DP/rent credit separate from the optional security deposit;
- Admin onboarding and paid-booking UI with progressive disclosure, confirmation
  before abandoning entered negotiated values, clear validation, and immutable
  paid-booking locking;
- renewal successor creation that takes a fresh commercial snapshot and cannot
  be activated through the generic onboarding activation path;
- payments, formal invoices/receipts, contract-paid proof, Admin reports,
  Property Owner views, Penghuni billing, and checkout calculations reading the
  same contractual snapshot without exposing the private negotiation reason to
  Owner or Penghuni.

Verification recorded for this checkpoint:

- 74 focused custom-lease tests passed; 1 disposable PostgreSQL execution test
  was skipped because Docker/PostgreSQL disposable runtime was unavailable;
- 19 renewal behavior and contract tests passed;
- API and Admin production builds passed;
- focused API/Admin lint and whitespace checks passed;
- migration `081` SHA-256 equals the manifest value
  `4082bbe6e0aa5ed02a02701483e5c35524a1f3c64ffa8f6af5c72f5d33438279`;
- the final Impeccable UI detector reported no findings on the two changed
  transactional interfaces.

Stage 4 later completed PostgreSQL 17 disposable first-apply/replay/sentinel and
atomic-rollback proof for migrations `081`–`082`. Row counts and financial totals
for rooms, residents, leases, occupancies, invoices, payments, deposits, and
contract values matched the restored migration-080 baseline. Authenticated Admin
runtime QA also verified the current tenancy projection and checkout entrypoint.
Current production-ledger preflight, Linux release builds, controlled deployment,
and post-deploy checks remain required; do not infer production completion from
the local checkpoint.
