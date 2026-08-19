# Property Owner Portal Experience and Data Projection Completion Plan

Status: W10-OWNER-E1 THROUGH E6 SOURCE IMPLEMENTED AND AUTOMATED VERIFIED; RUNTIME DEFERRED
Package: W10-OWNER-E
Baseline when drafted: `b6ac235aae5c89481e364f027c6e8ce5d61a8b9c`
Runtime status: DEFERRED

### Current execution evidence

**W10-OWNER-E3 — Finance, settlement, payout, and reports:** source
implemented and focused automated verification passed. Finance now uses a
dedicated authenticated Owner projection derived from the same period-bound,
effective-assignment and service-coverage report authority as preview/export.
It returns only earnings, Owner-safe adjustments, settlement state, and
payout facts; opaque record identifiers, tenant payment data, payment proofs,
bank details, and tenant identity are excluded. The Owner UI provides period
selection, normalized room search, settlement and earning filters, semantic
status badges, reconciliation cards, and read-only PDF/XLSX exports. Runtime,
browser QA, and canonical DB verification remain deferred.

**W10-OWNER-E2 — Assets, room detail, and occupancy projection:** source
implemented and focused automated verification passed. The authenticated Owner
projection now provides paginated assets and occupancy views, normalized server
search, effective assignment scope, safe lease/occupancy/billing state,
transfer/renewal/checkout correlation, and scoped open-issue counters. The
room-detail projection exposes the same safe billing and lifecycle summaries.
Resident output remains limited to display name in occupancy context; contact,
identity documents, payment proof, credentials, internal notes, and raw audit
fields are excluded. Runtime/browser QA and canonical DB verification remain
deferred.

**W10-OWNER-E4 — Issues and notifications:** source implemented with focused
automated verification. Complaint, maintenance, and notification projections
now include only safe room/building context derived from the authenticated,
period-bound Owner scope. The Owner UI provides grouped issue/maintenance and
notification cards, search, priority/status/date filters, result counts,
semantic status badges, empty/error states, and Owner-only room-detail links.
Private resident identity, internal notes, raw evidence or storage paths, raw
costs, and Admin mutation routes remain excluded. Runtime/browser QA and
canonical DB verification remain deferred.

**W10-OWNER-E5 — Dashboard and account:** source implemented and focused
automated verification passed. Dashboard KPI cards and attention summaries link
to their authoritative Owner destinations. Account presentation exposes only
authenticated identity, read-only scope, and support guidance. No-assignment
summary responses are zero-safe so the UI can show an explicit empty state.
Runtime/browser QA and canonical DB verification remain deferred.

**W10-OWNER-E6 — Automated hardening:** focused backend Owner authority and
portal contracts pass 26/26 with two disposable-PostgreSQL proofs skipped, and
focused Admin Owner/portal/shell regressions pass 34/34. Owner error boundaries
keep recovery links inside the Owner route allowlist, asset query failures no
longer silently fall back to a stale bootstrap list, the safe account surface
remains available without an active assignment, and loading/error states still
fail closed. Backend and Admin focused ESLint/Prettier, Admin typecheck, both
production builds, Impeccable detection, and `git diff --check` pass. Runtime
light/dark, responsive, browser, release, and rollback evidence remain deferred
to an explicitly approved QA environment.

## 1. Purpose

This plan completes the authenticated Property Owner portal as a coherent,
read-only product surface. It does not reopen or weaken the verified W10-A
through W10-D ownership and financial authorities.

The target is **safe data parity**, not Admin DTO parity:

- an Owner receives the same authoritative business facts that Admin uses for
  assets within that Owner's effective scope;
- every fact is projected through Owner-specific privacy, period, and scope
  rules;
- Admin-only mutations, private resident identity, raw evidence, internal
  notes, storage paths, credentials, and audit internals remain excluded;
- the frontend never reconstructs authority through static data or client-side
  joins.

## 2. Authority and Precedence

Implementation must follow, in order:

1. `DATA_AUTHORITY_MATRIX.md`
2. `DOMAIN_LIFECYCLE_CONTRACTS.md`
3. `PROPERTY_OWNER_SCOPE_AND_EXPERIENCE.md`
4. `PROPERTY_OWNER_PRIORITY_IMPLEMENTATION_PLAN.md`
5. `OWNER_POLICY_DECISIONS_AND_GLOSSARY.md`
6. `BILLING_REMINDER_NOTIFICATION_REPORTING.md`
7. `TRACEABILITY_MATRIX.md`
8. this completion plan
9. `DESIGN.md` for presentation and interaction rules

If source, schema, or a higher-authority document contradicts this plan, stop
and reconcile the contradiction before implementation.

## 3. Locked Product and Security Rules

1. `property_owner` is always read-only.
2. Owner scope is derived only from authenticated identity and effective W10
   assignments. The client never supplies an Owner identity override.
3. Rumah Kost ownership is building-scoped and covers every room in the
   assigned building for the effective period.
4. Apart Kost ownership is room-scoped for the effective period.
5. Current operational scope and historical financial scope are distinct.
6. Payment, Earned Rent, Owner Entitlement, Owner Settlement, and Owner Payout
   are distinct authorities and must remain visibly distinct.
7. No Owner response may expose resident NIK, KTP, private address, phone,
   email, emergency contact, credentials, payment proof, bank account values,
   storage path, internal note, raw audit, idempotency key, or unrelated asset.
8. Safe resident identity means a display name only when needed to understand
   current occupancy. It is not permission to expose a resident profile.
9. All period calculations use authoritative PostgreSQL time and explicit
   period bounds.
10. Every response fails closed when identity, assignment, property, period, or
    correlation is ambiguous.
11. Owner UI must not contain dormant or visually hidden Admin mutations.
12. Report preview, export, dashboard totals, and detail views must reconcile to
    the same effective scope and period.

## 4. Target Information Architecture

Owner pages become real routes with persistent navigation, URL history,
breadcrumbs, refresh safety, and direct links.

| Navigation              | Proposed route                             | Purpose                                           |
| ----------------------- | ------------------------------------------ | ------------------------------------------------- |
| Dashboard               | `/property-owners/portal`                  | Cross-domain ownership summary and alerts         |
| Aset Saya               | `/property-owners/portal/assets`           | Scoped buildings and rooms                        |
| Detail Aset             | `/property-owners/portal/assets/$roomCode` | Safe room 360 view                                |
| Hunian & Penyewaan      | `/property-owners/portal/occupancy`        | Safe occupancy and lease summaries                |
| Pembayaran & Pendapatan | `/property-owners/portal/finance`          | Period-bound financial recognition and settlement |
| Komplain & Maintenance  | `/property-owners/portal/issues`           | Scoped operational issue summaries                |
| Laporan                 | `/property-owners/portal/reports`          | Preview and export for a selected period          |
| Notifikasi              | `/property-owners/portal/notifications`    | Scoped Owner-safe alerts and events               |
| Profil Akun             | `/property-owners/portal/account`          | Safe account and profile facts                    |

`/property-owners` may remain a compatibility entry point that redirects by
authenticated role. Admin master data and Owner portal routes must remain
separate after role resolution.

## 5. Data Projection Contract

### 5.1 Dashboard

Authoritative inputs:

- effective building and room assignments;
- rooms and current room lifecycle status;
- current occupancy and lease projections;
- scoped complaints and work orders;
- owner earnings, entitlement, adjustments, settlements, and payouts;
- scoped notifications and reconciliation states.

Required Owner-safe output:

- buildings and rooms by Rumah Kost/Apart Kost;
- occupied, vacant, reserved, maintenance, and review-required totals;
- active leases and leases nearing their end;
- open complaints and active maintenance by severity;
- gross earned rent, recognized entitlement, fee, adjustments, settlement
  status, approved payout, and unpaid payout for the selected period;
- alerts for missing assignment, unsettled periods, reversals, transfers, and
  stale operational issues;
- direct links to the corresponding read-only Owner page.

### 5.2 Assets and Room Detail

Required list facts:

- room code, building, category, gender policy, room lifecycle status;
- current safe occupancy state;
- current lease state and end-date urgency;
- ownership source and effective assignment period;
- safe issue counters;
- safe payment state summary, never payment evidence.

Required detail facts:

- physical inventory and category-derived commercial facts;
- current ownership authority and period;
- safe resident display name when occupied;
- lease period and current lease state;
- aggregate billing status: current, partially paid, overdue, or settled;
- complaint and maintenance summaries;
- room activity events that are safe for Owner visibility.

### 5.3 Occupancy and Lease

Required facts:

- room and building;
- safe resident display name;
- occupancy start and current state;
- lease start, end, duration, and lifecycle state;
- approaching-end indicator;
- transfer/renewal/checkout outcome when it affects the owned asset;
- safe billing state summary.

Never include resident contact, credentials, documents, family details,
education details, or private address.

### 5.4 Finance

Required facts by selected period:

- earned rent recognition;
- Owner entitlement;
- management/service fee;
- itemized Owner-safe adjustments;
- settlement state and reconciliation status;
- payout approval, payout status, and payout date when available;
- reversal effects and transfer attribution;
- totals that reconcile to report preview/export.

The interface must explicitly explain that tenant payment is not automatically
Owner income and that Owner finance is report-only.

### 5.5 Complaints and Maintenance

Required facts:

- safe issue code;
- room/building context;
- category, priority, public-safe status, opened date, and resolved date;
- safe public summary;
- maintenance state and service coverage indicator.

Never include resident private identity, internal technician notes, raw cost
evidence, credentials, or storage paths.

### 5.6 Notifications

Required facts:

- type, priority, status, title, safe description, event date;
- safe room/building or financial-period context when applicable;
- read/unread presentation only when backed by authoritative read state;
- links only to an Owner-allowed route.

No notification may become an indirect route to Admin data or mutations.

### 5.7 Reports

Required behavior:

- explicit period selector;
- preview and export use identical scope and period rules;
- section totals reconcile with Finance and Dashboard;
- Unicode-safe output;
- no tenant PII, raw evidence, internal notes, or opaque internal IDs in the
  visible report;
- report metadata communicates period, generated time, and reconciliation
  state without overwhelming the primary content.

### 5.8 Account

Required facts:

- safe Owner display name;
- login identity already known to the authenticated user;
- account state;
- read-only access explanation;
- support/recovery guidance.

The page must not reveal password material, security tokens, or administrative
account controls.

### 5.9 Page-to-projection safe-field matrix

| Owner page              | Scope and period                                                             | Required safe facts                                                                                                                           | Explicit exclusions                                                                | Reconciliation and test evidence                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Dashboard               | Effective current assignment; selected finance period                        | Scoped building/room totals, occupancy state, lease urgency, issue count, earnings, entitlement, settlement, payout, and safe alerts          | Tenant PII, evidence, credentials, internal notes, raw audits                      | Each total links to and equals the corresponding destination projection for the same scope and period |
| Aset Saya               | Effective current assignment                                                 | Room/building, category, gender policy, lifecycle, occupancy and lease state, safe issue count                                                | Full resident profile, payment proof, raw finance data                             | Rumah Kost building scope and Apart Kost room scope must be tested independently                      |
| Detail Aset             | Effective current assignment and room                                        | Physical/category facts, ownership period, safe resident display name, lease period/state, aggregate billing state, safe issue/activity facts | Resident contacts/documents, payment methods/proofs, internal operational notes    | Direct URL with a foreign or expired room must fail closed                                            |
| Hunian & Penyewaan      | Effective current assignment; historical period only where authority permits | Room/building, safe resident display name, occupancy/lease dates and state, approaching-end, safe billing status                              | Any resident contact, family, education, address, credential, or document          | Transfer, renewal, and checkout outcomes appear only for an asset inside scope                        |
| Pembayaran & Pendapatan | Historical financial ownership scope and selected period                     | Earned rent, entitlement, fee, Owner-safe adjustments, settlement/reconciliation, payout status/date, reversal and transfer attribution       | Tenant payment proof, raw bank/payment data, payment mutation controls             | Totals equal Dashboard and report preview/export under identical period bounds                        |
| Komplain & Maintenance  | Effective current assignment; event period                                   | Safe issue code, asset context, category, priority, public-safe status/dates, service coverage                                                | Internal technician notes, raw cost/evidence, storage path, private resident facts | Cross-owner/property requests fail closed and UI has no Admin mutation affordance                     |
| Notifikasi              | Effective current assignment; event period                                   | Type, priority, safe title/description, date, safe room/building or period context                                                            | Admin routes, mutation links, private evidence, hidden operational metadata        | Every generated link belongs to the Owner route allowlist                                             |
| Laporan                 | Historical financial ownership scope and selected period                     | Same safe financial/operational facts as Finance, period metadata, reconciliation state                                                       | Tenant PII, raw evidence, internal notes, opaque internal IDs                      | Preview and export use the same projection and match each other                                       |
| Profil Akun             | Authenticated identity only                                                  | Owner display name, known login identity, account state, read-only and support guidance                                                       | Password/token material and every administrative control                           | No account endpoint accepts another Owner identity or exposes secrets                                 |

## 6. Reuse Architecture

### 6.1 Shared application shell

Use the Admin visual foundation through a role-aware shell interface:

- shared sidebar renderer;
- shared header, breadcrumbs, theme control, user menu, and logout;
- shared responsive bottom navigation;
- a dedicated Owner navigation registry containing only the routes in section
  4;
- no filtering of the Admin registry as an authorization mechanism.

The shell is shared; the navigation authority is not.

### 6.2 Shared presentation modules

Owner and Admin should reuse:

- semantic Button variants;
- domain-aware StatusBadge mappings;
- Card, Table, FilterToolbar, SearchField, DatePicker, EmptyState,
  ErrorState, Skeleton, Pagination, and ResultNotice patterns;
- design tokens and light/dark theme behavior.

They must not reuse Admin mutation panels or Admin response DTOs.

### 6.3 Backend seams

Use shared domain read authorities where Admin and Owner need the same fact,
then map them into separate response projections:

- an Owner scope resolver owns identity, property, assignment, and period
  enforcement;
- resource projections own Dashboard, Assets, Occupancy, Finance, Issues,
  Notifications, Reports, and Account responses;
- each projection receives already resolved scope and returns an explicit
  Owner-safe DTO;
- controllers remain thin and never accept arbitrary Owner scope from the
  client.

Do not call Admin HTTP endpoints from the Owner portal. Do not copy large Admin
SQL queries and remove fields afterward. The safe projection must be explicit
at the query/interface seam.

## 7. Design-System Completion

Merge an Owner profile into the existing root `DESIGN.md`; do not create a
competing design system.

The Owner extension must define:

- role-aware shell and Owner navigation rules;
- semantic badge vocabulary for asset, lease, finance, issue, notification,
  settlement, and payout states;
- filter-toolbar layout and reset behavior;
- normalized search behavior, including room-code searches without hyphens;
- Indonesian date/month picker behavior and canonical value formats;
- required button color/icon treatment;
- information, warning, success, danger, and access-boundary cards;
- card/table alignment, density, borders, typography, and responsive rules;
- light-mode contrast requirements;
- keyboard, focus, screen-reader, reduced-motion, and touch-target requirements;
- loading, empty, no-result, forbidden, unavailable, stale, and retry states.

## 8. Delivery Milestones

### W10-OWNER-E0 — Contract and Design Freeze

Deliverables:

- approve this plan;
- merge Owner rules into `DESIGN.md`;
- add page-to-projection traceability and safe-field matrices;
- record exact existing-route compatibility decisions;
- define the changed-file allowlist for E1.

Gate:

- no unresolved authority or privacy ambiguity;
- no implementation begins before the safe-field matrix is accepted.

E0 completion evidence (2026-08-17):

- The Owner role profile, shell rule, semantic statuses, filter/reset behavior, date/search behavior, light-mode border rules, and Owner route allowlist are merged into `DESIGN.md`.
- Existing code confirms the current Owner navigation is local tab state in `PropertyOwnerPortal.tsx`, while `AppShell` and `RegistrySidebar` are coupled to the Admin navigation registry. E1 therefore needs a dedicated Owner registry and a role-aware shell seam.
- This E0 work changes no API, authority, route behavior, database, or runtime setting.

### W10-OWNER-E1 — Shell, Routes, and Shared UI Foundation

Deliverables:

- role-aware shared shell;
- dedicated Owner navigation registry;
- real Owner routes and breadcrumbs;
- shared page header, filter, search, date, badge, button, state, and table
  primitives;
- compatibility redirect from the existing portal entry point;
- no changes to financial or ownership authority.

Gate:

- Owner cannot resolve or navigate to Admin routes;
- logout, refresh, back/forward, deep links, mobile navigation, and light/dark
  mode work consistently;
- existing Admin shell remains behaviorally unchanged.

#### E1 initial code allowlist

Tracked modifications:

- `apps/admin/src/components/layout/app-shell.tsx`
- `apps/admin/src/components/property-owner-portal/PropertyOwnerAssetDetailPage.tsx`
- `apps/admin/src/components/property-owner-portal/PropertyOwnerPortal.tsx`
- `apps/admin/src/routes/property-owners/index.tsx`
- `apps/admin/src/lib/property-owner-portal.ts`
- `apps/admin/src/lib/property-owner-portal.test.ts`
- `apps/admin/src/lib/w10-owner-admin-shell.test.ts`
- `apps/admin/src/routeTree.gen.ts` only when source routes require regenerated tree output
- `docs/21-kost-management-ecosystem-overhaul/PROPERTY_OWNER_PORTAL_COMPLETION_PLAN.md`

New source files:

- `apps/admin/src/components/property-owner-portal/OwnerPortalShell.tsx`
- `apps/admin/src/lib/property-owner-route-registry.ts`
- `apps/admin/src/routes/property-owners/portal/index.tsx`
- `apps/admin/src/routes/property-owners/portal/assets/index.tsx`
- `apps/admin/src/routes/property-owners/portal/occupancy.tsx`
- `apps/admin/src/routes/property-owners/portal/finance.tsx`
- `apps/admin/src/routes/property-owners/portal/issues.tsx`
- `apps/admin/src/routes/property-owners/portal/reports.tsx`
- `apps/admin/src/routes/property-owners/portal/notifications.tsx`
- `apps/admin/src/routes/property-owners/portal/account.tsx`

E1 must not change backend projections, database schema, financial/ownership logic, Admin route authority, W07 source, or Owner mutation authority. The detail asset route remains compatible while its presentation moves behind the Owner shell.

E1 completion evidence (2026-08-18):

- `AppShell` retains the Admin registry and breadcrumb as defaults while accepting Owner-specific shell slots.
- Owner navigation is sourced from one dedicated read-only registry with eight URL-backed routes; no Admin route is reused.
- `/property-owners` remains the Admin master-data page for Admin and redirects `property_owner` to `/property-owners/portal`.
- Dashboard navigation, browser back/forward, deep links, asset-detail breadcrumbs, desktop sidebar, mobile priority navigation, notification link, theme control, account menu, and logout now share the canonical shell behavior.
- Existing shared `Button`, `Badge`, `Input`, `Select`, `MonthYearPicker`, loading/error states, cards, and design tokens are reused; filter reset uses the destructive semantic button.
- Historical owners are redirected away from current-only dashboard, asset, and occupancy URLs to period-bound reports.
- Focused Owner shell and portal tests, Admin typecheck/build, changed-source ESLint/Prettier, Impeccable layout detection, and `git diff --check` pass. The generated `routeTree.gen.ts` is regenerated successfully by the build but remains excluded from the focused Prettier gate because the active TanStack generator rewrites its output. Runtime/browser validation remains deferred.

### W10-OWNER-E2 — Assets, Room 360, and Occupancy Correlation

Deliverables:

- complete Owner-safe assets projection;
- complete Owner-safe room detail projection;
- new Hunian & Penyewaan projection/page;
- room/building grouping, filters, normalized search, badges, and pagination;
- safe occupant, lease, payment-state, issue, ownership-period, transfer,
  renewal, and checkout correlations.

Gate:

- Rumah Kost and Apart Kost scope scenarios pass;
- assignment changes and historical periods do not leak current/unrelated
  facts;
- no resident PII appears in API, UI, logs, or test snapshots.

### W10-OWNER-E3 — Finance, Settlement, Payout, and Reports

Deliverables:

- period-bound finance projection and UI;
- clear separation of all financial authorities;
- settlement/reconciliation and payout views;
- report preview/export reconciliation;
- period picker, filters, status badges, KPI cards, tables, and safe empty/error
  states.

Gate:

- Dashboard, Finance, preview, and export totals reconcile;
- reversals, adjustments, transfers, service coverage, and historical
  ownership are covered;
- no Owner finance mutation route exists.

### W10-OWNER-E4 — Issues and Notifications

Deliverables:

- complaint and maintenance projections with safe room/building context;
- notification projections with safe source context;
- priority/status/date filters, search, grouping, result notices, and semantic
  states;
- links constrained to Owner routes.

Gate:

- cross-owner/property issue and notification access fails closed;
- internal notes, private resident identity, evidence paths, and raw costs are
  absent;
- notification links cannot escape the Owner allowlist.

### W10-OWNER-E5 — Dashboard and Account Completion

Deliverables:

- reconciled cross-domain Dashboard KPIs and alerts;
- direct links to Owner pages;
- safe account/profile page;
- complete loading, boundary, historical, unavailable, and no-assignment
  states.

Gate:

- Dashboard counts reconcile with their destination pages;
- no card is decorative or backed by frontend-only calculations;
- historical Owner access remains period-bound.

### W10-OWNER-E6 — Automated and Runtime Hardening

Deliverables:

- backend behavioral tests for identity, scope, period, privacy, and
  reconciliation;
- frontend route, parser, component, accessibility, and responsive tests;
- Admin regression tests for reused shell/primitives;
- light/dark and desktop/tablet/mobile runtime QA;
- browser checks for navigation, filters, date controls, exports, retry states,
  and direct links;
- release/rollback evidence and documentation reconciliation.

Gate:

- focused tests, builds, lint, typecheck, Prettier, and `git diff --check` pass;
- runtime QA uses an explicitly approved local/QA environment;
- canonical DB/deployment remains a separate authorized operation;
- final status may become `AUTOMATED VERIFIED; RUNTIME DEFERRED` or
  `RUNTIME VERIFIED` only when evidence supports it.

## 9. Mandatory Behavioral Scenarios

1. Owner A cannot see Owner B's room by code, ID, search, direct link, report,
   notification, or exported file.
2. A Rumah Kost assignment exposes all rooms in the building and no rooms
   outside it.
3. An Apart Kost assignment exposes only explicitly assigned rooms.
4. A future assignment does not enter current operational scope.
5. An expired assignment disappears from current operations but remains in
   properly bounded historical finance/reporting.
6. Ownership transfers split facts by effective period without rewriting
   history.
7. Room transfer, renewal, and checkout outcomes appear only for scoped assets
   and never expose mutation controls.
8. Safe resident display name may appear for an occupied room; every prohibited
   resident field remains absent.
9. Payment proof and tenant payment mutation facts never enter Owner responses.
10. Earnings, entitlement, settlement, and payout remain separately labeled and
    mathematically reconcilable.
11. Complaint, maintenance, and notification records include safe asset context
    and exclude internal notes/evidence.
12. Dashboard totals equal destination-page totals under the same period and
    scope.
13. Report preview equals export under the same period and scope.
14. Empty, historical, scheduled, unavailable, forbidden, stale, and partial
    backend failures have explicit, safe UI states.
15. Light and dark themes meet visible-border and readable-text requirements at
    supported breakpoints.

## 10. Execution and Commit Strategy

- Implement one milestone at a time; do not perform a portal-wide big-bang
  rewrite.
- Each milestone starts with an exact allowlist and dirty-baseline check.
- Prefer vertical slices that complete backend projection, frontend page, and
  behavioral tests together.
- Never add static mock data to unblock a page.
- Never stage or commit unrelated baseline-dirty files.
- Commit only after focused review and verification for that milestone.
- Do not mark W10-OWNER-E complete merely because pages render.
- Canonical migration, service start, seed, browser automation, staging,
  deployment, and push require their own explicit authorization.

## 11. Completion Definition

W10-OWNER-E is complete only when:

- all eight Owner navigation areas are real, consistent, and responsive;
- every displayed fact comes from an authoritative, property-scoped,
  period-aware backend projection;
- Admin and Owner use shared visual foundations without sharing authority;
- privacy and read-only boundaries pass behavioral tests;
- cross-page and report reconciliation passes;
- automated quality gates pass;
- runtime status is reported honestly and separately from source completion.
