# ADR 0005: Permanent Asset Ownership Registration

Status: Accepted

Date: 2026-09-21

## Context

Property Owner assets were originally modelled with `effective_from` and
`effective_until` as operational eligibility dates. This made a building that
was already assigned to an Owner appear unowned when a resident's lease start
date preceded the stored technical date. It blocked valid Owner-sponsored
occupancy and exposed an unnecessary ownership schedule in Admin.

The operating policy is different: selecting a building or room for an Owner
records a permanent ownership right. There is no start-date selector, end-date
selector, scheduled expiration, or temporary ownership term in the Admin
workflow.

## Decision

1. Current operational ownership is determined only by an assignment with
   `assignment_status = 'active'`.
2. Admin asset selection, room ownership display, and Owner-sponsored
   onboarding must not compare a lease, check-in, or today's date with
   `effective_from` or `effective_until`.
3. Releasing or reassigning an asset is an explicit correction command. It
   changes assignment status and records the reason/audit event; it is never a
   scheduled or automatic expiry.
4. Existing `effective_from` and `effective_until` values remain stored as
   immutable legacy/audit provenance. They are not shown as an ownership period
   and are not backfilled, overwritten, or used to rewrite established
   financial records.
5. Historical Owner earnings, settlements, payouts, and reports retain their
   existing source data. This decision changes current operational eligibility,
   not past financial attribution.

## Consequences

- An Owner already assigned to `RK-05` is immediately valid for every room in
  that Rumah Kost building, including a sponsored lease whose contractual start
  precedes an old technical timestamp.
- A room or building has no Owner only when it has no active assignment.
- Admin can still correct a wrong assignment explicitly, while the audit trail
  remains intact.
- New work must not add an effective-date picker, expiry rule, or date-based
  onboarding validation for ownership registration.

## Supersession

This ADR supersedes the operational portion of `DEC-OWNER-005`. It does not
remove legacy columns or alter the historical financial reporting policy.
