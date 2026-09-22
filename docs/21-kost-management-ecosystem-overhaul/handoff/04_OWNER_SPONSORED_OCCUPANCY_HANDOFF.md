# Owner-sponsored occupancy handoff

Status: **IMPLEMENTED LOCALLY — RELEASE PREFLIGHT PENDING**

## Purpose

`Hunian Tanggungan Owner` records an owner’s family member or other approved
dependent as a normal resident and room occupant without charging room rent.
It is a commercial mode, not a 100% discount. This distinction keeps rent,
owner entitlement, and management fees unambiguous.

## Non-negotiable rules

- Only an Admin may create it.
- The room, resident, duration, activation, check-in, check-out, audit history,
  and room availability follow the normal lease lifecycle.
- Rent, booking fee, DP, security deposit, rent invoice, and owner rent
  entitlement are all zero.
- Admin records whether the management fee is `charged` or `waived` from the
  Owner's instruction. A charged fee remains a separate `management_fee`
  payment; a waived fee is Rp0 and cannot receive a payment.
- There is no due date, overdue status, or late-payment reminder for this fee.
- For a charged fee, the payer is `resident`, `owner`, or `other`; an `other`
  payer requires a name. A waived fee has no payer.
- A sponsored term must reference the Owner with an active permanent assignment
  to the room’s building for Rumah Kost, or to the exact room for Apart Kost.
- An active sponsored term protects the selected ownership assignment from
  being released or shortened in a way that would invalidate history.
- Check-out can finish when a management-fee balance remains. It closes room
  occupancy, not the separate fee balance.

## Authoritative data

Migration `087_owner_sponsored_occupancy_authority.sql` adds the base authority.
Migration `092_owner_sponsored_optional_management_fee.sql` adds the explicit
`charged`/`waived` decision and zero-fee constraints:

- `leases.commercial_mode` (`rent` or `owner_sponsored`);
- sponsorship input snapshots on `onboarding_commitments`;
- `owner_sponsored_lease_terms` for owner scope, payer, reason, and lifecycle;
- `owner_sponsored_management_fee_progress`, which calculates the fee using
  the effective management-fee version for every month in the lease term;
- `management_fee` as a first-class payment purpose.

The view is the authority for current projected, verified, pending, remaining,
and payment-status values. `projected_management_fee_amount` on the term is a
stored snapshot refreshed when Admin corrects the period; it is not used to
silently replace the effective-dated projection.

## Onboarding flow

1. Admin selects **Hunian Tanggungan Owner** on the new lease form.
2. Admin selects the assigned property owner, whether management fee is charged
   or waived, the payer when charged, and a reason.
3. Admin selects normal start date and duration.
4. The form shows Rp0 room rent and either the projected management fee or an
   explicit **Dibebaskan oleh Owner** state.
5. Commit creates the resident/lease/term but creates no rent settlement,
   booking, DP, deposit, invoice, or payment allocation.
6. Activation and check-in may proceed without rent settlement.

## Payments, reports, and owner portal

- For `charged`, Admin records a direct payment with purpose **Biaya pengelolaan
  hunian**. For `waived`, the payment action is not available.
- The maximum payment is the remaining sponsored-fee balance; a receipt uses
  the dedicated payment purpose.
- Billing shows the sponsor, payer, fee progress, and explicit flexible
  schedule; it does not show a rent outstanding amount.
- Admin finance reports include management-fee cash separately from rent.
- Owner pages show the room as occupied under owner sponsorship, rent target
  and rent entitlement as Rp0, and fee payment progress separately.

## Corrections and lifecycle boundaries

- Date/duration corrections retain `owner_sponsored`, contract rent Rp0, and
  no rent settlement schedule. They refresh the sponsored fee projection.
- Transfer and renewal commands currently reject sponsored terms rather than
  creating an incorrect rent successor. Admin must create a new sponsored
  occupancy after the existing term is closed. A later dedicated stage may add
  atomic sponsor-aware transfer/renewal support.
- Completion of check-out marks the sponsored term completed. A remaining fee
  balance stays visible but does not reactivate the resident or room.

## Required tests and release checks

- Unit tests cover projection math, DTO constraints, and migration/manifest
  binding under `backend/api/test/owner-sponsored-occupancy/`.
- API build and Admin typecheck must pass.
- Run migration 087 only on a disposable PostgreSQL target first: first apply,
  replay, rollback, sentinels, and verification of no historical lease or
  payment changes.
- Verify both owner-assignment modes, charged/waived modes, all three charged-fee
  payers, zero rent outputs, fee progress, checkout with unpaid fee, and
  correction of a sponsored term.
- Production migration/deployment requires separate authorization.

## Planned document and Admin-surface refinement (not implemented)

The next refinement keeps owner-sponsored occupancy financially explicit while
separating proof of occupancy from management-fee billing and payment evidence.
This section records the approved plan only; it is not an implementation gate.

### Document taxonomy

- `SURAT KETERANGAN HUNIAN TANGGUNGAN OWNER` is available for every sponsored
  occupancy. It identifies the resident, room, property, Owner, contract
  period, and the rent/management-fee policy. It is not an invoice.
- `INVOICE BIAYA PENGELOLAAN` is generated only when management fee is charged.
  It carries the monthly fee, total projected fee, received amount, balance,
  and status (`BELUM DIBAYAR`, `OUTSTANDING`, or `LUNAS`).
- `KUITANSI PEMBAYARAN BIAYA PENGELOLAAN` remains a per-payment receipt and
  uses the latest verified fee progress when re-generated, while the original
  receipt remains available for audit.

The Admin detail card should expose `Unduh surat hunian Owner` for every
sponsored lease, `Unduh invoice biaya pengelolaan` only for charged leases, and
the existing per-transaction receipt action. A waived fee is represented by
`BIAYA DIBEBASKAN`, not a misleading payment `LUNAS` state.

### Management-fee receipt content

The dedicated receipt template must show the resident name, Owner, payment
responsible party, human-readable contract period and room, monthly fee, total
fee for the term, amount of this transfer, total received, remaining balance,
payment date, and localized payment method (for example, `Transfer bank`).
The labels are:

- `Jumlah transfer pada kuitansi ini terbilang` for the current transaction;
- `Total biaya pengelolaan yang sudah diterima terbilang` for cumulative
  verified receipts.

The receipt gets a `LUNAS` stamp only when the charged fee has no remaining or
pending balance. Long names and explanatory text must wrap or continue on a
new page; text must never overlap.

### Owner identity and badges

Resident detail separates `Owner pemilik kamar` from
`Penanggung biaya pengelolaan`. A waived record displays the actual Owner with
the explicit suffix `biaya dibebaskan`. The resident list uses semantic,
accessible colors: blue for owner sponsorship, green for waived/no-fee and
paid states, amber for `OUTSTANDING`, and red for unpaid action-required
states. `Dibayar sebagian` is renamed to `Outstanding` and includes the
remaining amount.

### Planned verification

Before implementation, tests must cover waived, charged-unpaid,
charged-partial, and charged-paid records; the new statement and both fee
documents; localized period/room/payment labels; current-state regeneration;
audit-original retrieval; and multi-page PDF wrapping.
