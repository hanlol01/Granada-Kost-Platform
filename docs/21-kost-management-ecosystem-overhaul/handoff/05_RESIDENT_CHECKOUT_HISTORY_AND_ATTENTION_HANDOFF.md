# Resident check-out history, attention and Owner inventory

Status: implemented locally; updated-API browser smoke test pending.
Approved scope: revisions 3–7, confirmed before implementation. This is a
read-model/UX extension of checkout Stage 3, not a new financial authority.

## Operational behavior

- `/tenants` defaults to all resident statuses. Completed/inactive residents
  remain discoverable alongside active residents; an explicit status filter
  still narrows the list. “Masih perlu tindakan” narrows unresolved checkout
  work without claiming physical handover and financial completion are identical.
- Scheduled handovers include today, future dates and overdue dates until the
  physical handover is recorded. Overdue handovers also have a separate red
  status/filter. Business-date boundaries use Asia/Jakarta.
- “Pemberitahuan” starts collapsed above resident filters. Eight categories use
  current property-wide counts rather than list pagination/search. Categories
  may overlap. Selecting one clears conflicting filters, keeps property scope,
  applies the matching predicate and scrolls to results after loading.
- The resident-detail checkout action opens all five recorded stages after
  completion. Saved notice, approval, handover, inspection, final settlement,
  refund and linked final-invoice payment records remain read-only. Evidence
  uses the existing authorized file-preview component. Deleted/unavailable
  files leave their record visible; missing legacy notes are not reconstructed.
- Owner building inventory expands to all rooms, with each room’s plot number.
  Building plot labels aggregate unique plot numbers; Apart Kost uses its own
  room plot number. Gender policy is translated to Putra/Putri/Campuran in the
  ownership chooser and owned-asset cards. Ownership assignments are unchanged.

## Authority and boundaries

`resident-attention.sql.ts` supplies the same category predicates to summary,
list and count queries. All queries retain property authorization. A completed
historical checkout for a different lease cannot suppress a current active
lease’s outstanding/expiry notification.

Final settlement decisions remain immutable. Refund state is read from the
refund ledger. Current amount due is read from linked invoices, credits,
verified payment allocations and partial reversals. Legacy settlements without
invoice links retain their recorded amount due rather than appearing paid.

History evidence and final-payment file references are scoped to the command’s
property. Only active files are previewable. This extension performs no schema
migration, historical backfill, seed, production deployment or service restart.

## Verification evidence

- Focused checkout behavior/contract and frontend/read-model tests: 75 passed,
  zero failed, one existing disposable-database test skipped.
- Admin TypeScript check, API production TypeScript compilation and full Admin
  Vite production build passed.
- Focused Admin lint passed with two existing route fast-refresh warnings.
- A local PostgreSQL REPEATABLE READ / READ ONLY transaction checked eight
  count/drill-down matches, 52 checkout commands and 123 Owner inventory rooms,
  then rolled back. No financial/resident/room data was modified.
- Windows Application Control blocks the installed esbuild executable. Tests
  used the installed TypeScript compiler through a local Node module hook;
  system protections were unchanged. The Vite build itself passed using its
  installed Rolldown pipeline.
- The browser displayed the new card and graceful load-error state, but the
  running API still lacks the new endpoint. Successful loaded-card, history
  attachment and Owner-room browser checks require restarting the built API
  through the user’s normal local workflow. No process/port was stopped here.

## Remaining runtime checks

After restarting the locally built API and refreshing the Admin page:

1. Expand Pemberitahuan; each nonzero count must match the category drill-down
   with default filters, and Reset Filter must restore all statuses.
2. Filter Pengembalian dana selesai, open a resident and Lihat riwayat check-out;
   stages 1–5, available proof previews and documents must be accessible without
   editable completed decisions.
3. Inspect a scheduled future/today/overdue handover and verify its date/status.
4. Expand RK rooms in the ownership chooser and owned card; confirm all rooms,
   per-room plots, aggregate unique plots and translated gender labels. Inspect
   an AK assignment’s plot label as well.
