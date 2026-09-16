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
- The management fee is still payable. It is a separate `management_fee`
  payment, never a rent payment and never an `other_charge` workaround.
- There is no due date, overdue status, or late-payment reminder for this fee.
- The fee payer is one of `resident`, `owner`, or `other`; an `other` payer
  requires a name.
- A sponsored term must reference the owner assigned to the room’s building
  for Rumah Kost, or to the exact room for Apart Kost.
- An active sponsored term protects the selected ownership assignment from
  being released or shortened in a way that would invalidate history.
- Check-out can finish when a management-fee balance remains. It closes room
  occupancy, not the separate fee balance.

## Authoritative data

Migration `087_owner_sponsored_occupancy_authority.sql` adds:

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
2. Admin selects the assigned property owner, fee payer, and a reason.
3. Admin selects normal start date and duration.
4. The form shows Rp0 room rent and the projected management fee separately.
5. Commit creates the resident/lease/term but creates no rent settlement,
   booking, DP, deposit, invoice, or payment allocation.
6. Activation and check-in may proceed without rent settlement.

## Payments, reports, and owner portal

- Admin records a direct payment with purpose **Biaya pengelolaan hunian**.
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
- Verify both owner-assignment modes, all three fee payers, zero rent outputs,
  fee progress, checkout with unpaid fee, and correction of a sponsored term.
- Production migration/deployment requires separate authorization.
