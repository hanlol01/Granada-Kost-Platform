# KMO-W02C-D — Category Content and Publication

Status: `KMO-W02C-D — AUTOMATED VERIFIED; RUNTIME DEFERRED`

## Delivered boundary

- Rumah Kost and Apart Kost each own one property-scoped category content
  workspace.
- Category facilities use normalized labels, deterministic ordering, archive
  history, public descriptions, and versioned publication.
- Category gallery content uses private source files and public derivatives,
  deterministic ordering, one cover, archive state, and published versions.
- Internal operating policy remains separate from the structured public-safe
  terms projection.
- Public terms and category content support drafts, effective-dated publishing,
  immutable version history, and restore-to-draft.
- Room list and full room detail consume facilities from category authority.
- Legacy common-area gallery records are archived by the additive migration;
  they are not deleted.

## Safety authority

- Reads and writes are property-scoped and fail closed before lookup,
  idempotency, or mutation.
- Content writes are transactional, idempotent, serialized, and audited with
  allowlisted metadata.
- Strict DTOs and frontend parsers reject malformed, coerced, extra, or
  cross-scope fields.
- Failed gallery validation creates no gallery row; public projection exposes
  only effective published content and public derivatives.
- Internal policy, storage paths, credentials, raw metadata, and administrative
  file URLs are excluded from public responses.
- W02A fixed inventory and W02B commercial authority remain unchanged; no
  room-level facility or commercial override is introduced.

## Schema and compatibility

- Migration `023_category_content_publication.sql` is registered in the
  checksum-aware W01 manifest.
- The migration is additive and preserves historical facility, gallery, and
  policy records.
- Reconciliation checks cover the exact two categories, normalized facility
  duplicates, orphaned category content, gallery cover/public derivative
  integrity, publication ambiguity, and policy applicability.
- Migration 023 was applied to the canonical development database on
  2026-08-01 after a custom-format backup; immediate full-manifest replay made
  zero writes and content reconciliation remained matched.

## Automated evidence

- Focused backend W02C-D contract: migration, validation, property ordering,
  transaction/idempotency/audit, file safety, publication, and public projection.
- Focused Admin W02C-D contract: exact parsers, property/category cache scope,
  stable mutation intent, two-category workspaces, safe preview, and stale-scope
  rejection.
- W01 migration-manifest, W02A room-detail, M10, M13, M14, and M15 regression
  contracts remain green.
- Full Admin tests, API lint/build, Admin typecheck/lint/build, formatting, the
  aggregate read-only gate, and diff checks are part of the final validation
  matrix.

## Deferred boundary

- Browser publication mutation evidence remains deferred.
- W03 public catalog UI remains pending; this package only provides its
  public-safe projection.
- Payment gateway, provider integration, resident lifecycle, billing mutation,
  and public booking behavior are outside this package.
