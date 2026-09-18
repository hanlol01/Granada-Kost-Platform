# KOSTATION feature handoff

Status: **STAGES 0–3 IMPLEMENTED LOCALLY — STAGE 4 LOCAL GATES PASSED, PRODUCTION PREFLIGHT PENDING**

This folder is the execution boundary for three related but separately testable
features:

1. [Custom lease agreements](01_CUSTOM_LEASE_AGREEMENT_HANDOFF.md), covering
   negotiated duration and monthly pricing.
2. [Lease checkout](02_LEASE_CHECKOUT_HANDOFF.md), covering early departure,
   handover, inspection, and final settlement.
3. [Lease data correction](03_LEASE_DATA_CORRECTION_HANDOFF.md), covering legacy
   check-in dates and versioned corrections to lease dates, duration, and value.
4. [Owner-sponsored occupancy](04_OWNER_SPONSORED_OCCUPANCY_HANDOFF.md), covering
   rent-free family occupancy with separately payable management fees.

The shared dependency and release gates are in
[the roadmap](00_COMMERCIAL_AND_CHECKOUT_ROADMAP.md).

## Current implementation checkpoint

- Custom lease Stage 0–2 is implemented in the working tree: one shared
  commercial resolver, immutable standard/negotiated snapshots, 1–120 month
  settlement policy v3, Admin onboarding and paid-booking flows, renewal
  compatibility, and the listed payment/document/report/Owner/Penghuni
  consumers.
- Migration `081_custom_lease_commercial_authority.sql` is additive and its
  manifest checksum is verified locally. PostgreSQL 17 disposable proof passed
  for first apply, replay, sentinel presence, financial/row-count preservation,
  and atomic rollback. The legacy rent-credit and deposit-limit constraints are
  temporarily recreated as identical `NOT VALID` constraints around the
  metadata backfill so historical amounts remain untouched.
- Focused custom-lease tests pass locally (74 passed, 1 disposable PostgreSQL
  test skipped); renewal compatibility passes separately (19 passed). API and
  Admin production builds and focused lint pass.
- Checkout Stage 3 is implemented in the working tree: contextual entry from
  resident and lease detail, notice and approval, evidence-backed handover and
  inspection, physical/financial lifecycle separation, damage above deposit,
  one net payable direction, final billing/refund documents, Admin report
  filters, privacy-safe Owner projections, and lease-scoped parking release
  that preserves access belonging to another active lease.
- Migration `082_lease_checkout_stage3_authority.sql` adds the final-invoice and
  settlement guards plus a collected short-notice earning source. Approved and
  paid short-notice compensation is attributed fully to the effective Owner;
  it creates no additional management fee and damage recovery is excluded.
  Apply, replay, sentinel, and rollback validation passes on local PostgreSQL
  17 without advancing the local ledger or retaining schema/data changes.
- Focused checkout contract and behavior tests pass locally (22 passed, 1
  disposable historical migration test skipped); formula and official-document
  coverage adds 13 passing tests. API and Admin production builds pass; API
  lint is clean and Admin lint has no errors.
- Stage 4 local audit also fixed the Admin tenancy parser to accept the immutable
  commercial projection. Authenticated runtime QA confirms the resident detail
  is complete, “Mulai proses check-out” is visible, the panel opens, and an
  unknown tenancy state cannot render an unnamed action. API, Admin, and
  Penghuni builds plus all three typechecks pass. Production-ledger preflight,
  Linux release builds, deployment, and post-deploy smoke tests remain separate
  production gates.
- The Admin activation flow now treats the lease start date as the normal
  activation and physical check-in date. Its primary action atomically performs
  both transitions; “Aktivasi saja” and manually different actual dates remain
  explicit exceptions. This change is additive: existing activation, occupancy,
  and historical production records are not backfilled or rewritten.
- Migration `083_enable_lease_checkout_for_operational_properties.sql`
  deliberately enables the Stage 3 checkout capability for existing properties
  that already have Admin lease reads and writes enabled. It changes capability
  configuration only; resident, lease, occupancy, room, billing, and checkout
  records remain untouched. Checkout command errors now scroll to and focus the
  accessible Admin alert, including a clear Indonesian message when a future
  property has not enabled the capability.
- Koreksi Data Penyewaan telah diterapkan lokal sebagai amendment berversi:
  tanggal check-in lama dibaca dari lifecycle, riwayat okupansi, lalu tanggal
  mulai okupansi tanpa fallback tanggal hari ini; perubahan periode menghitung
  ulang nilai kontrak dan mencatat tambahan kewajiban atau kredit tanpa
  menghapus pembayaran maupun dokumen lama. Migration
  `086_lease_data_correction_authority.sql` sudah lulus apply dan replay lokal.
- No production migration, service restart, release switch, commit or deploy is
  authorized by this checkpoint.
- Checkout UX correction work standardizes shared date and Rupiah inputs,
  confirmation dialogs, semantic button colors, focus after every stage transition,
  and an Admin-only “Batalkan & mulai ulang” action through the pre-settlement
  stages. Operational uploads are optional while financial evidence remains
  mandatory. Restart restores operational lease state without deleting the prior
  command or audit history; completed financial settlements remain immutable.
- Owner-sponsored occupancy is implemented locally through migration
  `087_owner_sponsored_occupancy_authority.sql`: it keeps rent, DP, deposit,
  rent invoices, and Owner rent entitlement at Rp0 while recording an
  effective-dated, separately payable management-fee progress for the normal
  occupancy duration. Admin correction preserves the sponsored mode; renewal
  and transfer are deliberately blocked until their own sponsor-aware stage is
  implemented, rather than creating an incorrect rent successor.

## Agent entry contract

Before writing code, the agent must read, in order:

1. `CONTEXT-MAP.md` at the repository root.
2. `docs/21-kost-management-ecosystem-overhaul/CONTEXT.md`.
3. `docs/adr/0001-custom-lease-agreement-authority.md`,
   `docs/adr/0002-checkout-and-final-settlement-lifecycle.md`, and
   `docs/adr/0004-late-checkout-penalty-policy.md`.
4. The assigned handoff and the linked source documents it names.
5. The current migration ledger and the current working-tree diff.

The canonical policy glossary has been reconciled with these handoffs. If a
lower-level legacy document still describes a three-month-only lease or combines
physical and financial checkout completion, this handoff and its ADR govern the
new work; surface any other conflict before writing code.

Then the agent must announce one assigned stage, its file/migration allowlist,
its dependencies, its RED test, and its completion criterion. Work on one
vertical slice at a time. A later stage may not silently repair an earlier
stage's policy.

## Source and decision rules

- The latest product-owner decision and the canonical policy glossary outrank
  screenshots and current UI copy.
- Current source proves what exists; it does not override the target policy.
- A production migration ledger is external state. Resolve its next version and
  checksum during deployment preflight; never guess the number from a local
  checkout.
- Legacy records are preserved. Backfill only with an explicit, reversible,
  auditable migration plan.
- Server-side calculations and authorization are authoritative; client values
  are proposals only.

## Implementation boundaries

- Implement the assigned stage only, with focused RED evidence before the fix.
- Keep Admin, API, Penghuni, Property Owner, invoices, receipts, reports, and
  exports on the same commercial and lifecycle authorities.
- Preserve idempotency, property scope, audit history, immutable snapshots, and
  existing deferred integrations.
- Do not publish to GitHub Issues, run migrations against production, seed data,
  restart services, or change release state from this handoff unless the active
  workflow grants that separate authority.

## Definition of handoff completion

The handoff is complete when an agent can identify the assigned files, domain
invariants, state transitions, formulas, migration boundary, tests, and release
evidence without asking the original author to restate the policy. Implementation
is a later phase.

## Reader questions this handoff must answer

An implementation agent must be able to answer these from the files without
conversation history:

1. Which amount is the standard comparison and which amount is contractual?
2. How are 1-, 2-, 3-, 11-, and 12-month contracts settled?
3. Which existing lease fields remain authoritative and which fields are added?
4. When does a room stop being occupied and when may it become vacant?
5. How are short notice, damage above deposit, amount due, and refund separated?
6. Which facts may the Property Owner see, and which Admin notes remain private?
7. Which tests and migration evidence close each stage?
