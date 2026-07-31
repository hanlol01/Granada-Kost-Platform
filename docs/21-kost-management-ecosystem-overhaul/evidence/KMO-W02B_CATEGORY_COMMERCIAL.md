# KMO-W02B — Category Commercial Authority

Status: `KMO-W02B — AUTOMATED VERIFIED; RUNTIME DEFERRED`

## Delivered boundary

- `kost_type_commercial_versions` is the effective-dated authority for category
  monthly tariff, annual contract value, the read-only 25% minimum-DP policy,
  permitted payment schedules, and security-deposit months.
- Migration 022 backfills the two approved categories per active property with
  the initial Rp1.800.000 monthly / Rp21.600.000 annual policy and one-month
  deposit rule.
- Admin category reads and writes are property-scoped, idempotent, transactional,
  audit-safe, and reject raw deposit overrides, coercion, unknown fields, and
  effective dates that are not strictly after the Jakarta database date.
- A category row and its commercial versions are locked before a future rate is
  scheduled. An existing future version fails closed, and scheduling does not
  rewrite the legacy current-rate cache or historical lease snapshots.
- Room list/detail and lease creation consume the current category version;
  historical lease snapshots remain immutable.
- Room persistence remains physical-inventory-only; room PATCH rejects commercial
  fields and does not update room tariff snapshots as a category side effect.

## Evidence

- Focused backend W02B contract: the 22-file migration manifest and ledger,
  disposable PostgreSQL first-apply/replay convergence, DTO validation,
  authorization/transaction ordering, commercial arithmetic, reconciliation,
  and lease snapshot boundaries.
- Focused Admin W02B contract: strict parser, exact requester body, stable
  idempotency intent, effective-date editor controls, and room commercial-field
  exclusion.
- Existing W02A-R2 room-detail and W00/M10/M13/M14/M15 regressions remain in the
  validation matrix.

## Boundary

W02C facilities/gallery and W02D terms/publication are not implemented here.
Payment gateway/provider/external integration remains disabled. Canonical
database migration execution and runtime/browser evidence remain deferred.
