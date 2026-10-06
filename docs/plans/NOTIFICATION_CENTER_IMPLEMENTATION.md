# Notification Center Implementation

Status: implemented locally on 2026-10-06; production deployment is intentionally out of scope.

## Delivered surface

- A shared, controlled notification UI lives in `packages/ui`. It provides the
  header bell, desktop popover, mobile bottom sheet, full inbox, compact
  preview, category icons, Jakarta timestamps, filters, pagination, loading,
  empty, failure, focus, and reduced-motion states.
- Admin, Property Owner, and Resident consume the same account-scoped API and
  React Query cache. Opening a bell refreshes data but never marks an item as
  read.
- The panel defaults to unread, shows no more than ten rows, and offers active
  rows plus a route to the full inbox. The full inbox adds active/archive views,
  category, priority, search, and date filters. Owner additionally has period
  and authorized asset filters.
- Expanding an unread row or following its safe destination marks that account's
  row as read. An `x` archives only that account's notification. Bulk actions
  affect the complete authorized active scope, rather than the visible preview.

## Authorization and lifecycle

- Migration `125_account_notification_inbox.sql` introduces
  `notification_account_states`, projection activation/state tables, and no
  destructive mutation of existing notification or workflow records.
- Read/archive state is keyed by notification and account. It is not shared
  between Admins, Owners, or Residents.
- The backend derives Admin property authorization, self-only Resident scope,
  and Owner scope from active/current or historically valid asset ownership.
  Owner responses redact resident identity, payment evidence, raw metadata, and
  unsafe destinations.
- All destinations are generated server-side and validated once more by the UI.
  No browser-supplied metadata URL is followed.
- Archiving is reversible at the data layer and remains visible/searchable in the
  archive view. No deletion or retention purge is exposed.

## Event coverage

- The idempotent outbox projector covers real committed booking, payment,
  billing, lease/check-in, checkout, room inspection, complaint, maintenance,
  vehicle, account, published Owner realization, verified Owner transfer, and
  Owner-borne management-fee events.
- Owner delivery is restricted to published/verified finance events or relevant
  owned assets. Publication and verified transfer remain distinct. Corrected
  realization records supersede rather than silently rewrite a prior notice.
- Resident announcement UI and notification delivery are intentionally absent,
  while rules and FAQ remain available.

## Migration note

The existing development ledger had already recorded migrations 122 and 123
with canonical manifest checksums while their checked-in source blobs had later
been reconciled. The official runner now accepts only the two exact, explicit
source checksums in addition to their manifest values; arbitrary source changes
still fail checksum validation. This avoids manual ledger edits and permits the
official runner to apply migration 125 normally.

## Local verification evidence

- `npm run typecheck --workspace=@granada-kost/admin`
- `npm run typecheck --workspace=@granada-kost/penghuni`
- `npm run build --workspace=@granada-kost/api`
- `npm run build --workspace=@granada-kost/admin`
- `npm run build --workspace=@granada-kost/penghuni`
- `node -r test/lease-revision/register-typescript.cjs
test/notification-center/notification-event-coverage.spec.ts` — 13 passing.
- `NOTIFICATION_INBOX_LOCAL_ROLLBACK_PROOF=true node
test/notification-center/account-inbox.spec.cjs` — 5 passing, including an
  isolated PostgreSQL transaction rolled back after authorization, dedupe,
  count, bulk, archive, and Owner-scope proof.
- `node test/notification-center/local-inbox-preflight.cjs` confirms the local
  development ledger has migration 125, no effective pending migration, and no
  write beyond the official migration run.
- Local Admin UI was inspected at desktop and 390 px mobile widths with real
  server rows and the header panel. No production/VPS action was performed.

## Remaining deployment gate

Before deployment, run the official migration runner against the target
environment, build/restart the API and both web applications, and smoke-test a
distinct Admin, Owner, and Resident account. Do not write migration ledger rows
manually.
