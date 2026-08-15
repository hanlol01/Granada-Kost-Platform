# KOSTATION Kost Management Ecosystem Overhaul

Status: **APPROVED TARGET — KMO-W00 THROUGH KMO-W06 DELIVERED; W10-OWNER-A THROUGH W10-OWNER-D AUTOMATED VERIFIED; RUNTIME DEFERRED**

Program code: `KMO`

Last implementation alignment: 2026-08-12 (Asia/Jakarta)

This directory is the canonical implementation plan for the post-M19 KOSTATION
functional overhaul. It turns the owner's operating policy, the product owner's
revision discussion, current repository evidence, and external interface
references into a decision-complete specification.

Planning documents do not prove implementation by themselves. Current source,
canonical database, reconciliation, automated, and runtime truth are separated
in the schema ledger and traceability evidence. A requirement advances only
after evidence is recorded against its traceability entry.

The latest direct-onboarding form amendment is recorded as
`SOURCE_IMPLEMENTED` until it has completed its own focused review and commit.
It does not retroactively change the delivered status of W05/W06 or advance W07.

Property Owner implementation truth is tracked separately: W10-OWNER-A is
committed at `3b6dd0020530fe8cc883136dd4b65a97399403f8`, W10-OWNER-B is committed at
`c5649f0`, W10-OWNER-A3 adds source-only migration 037 allocation-backed exact
service-coverage authority, and W10-OWNER-C/D have automated reconciliation and
security evidence with runtime deferred. The controlled runtime and rollback
procedure is recorded in
[`PROPERTY_OWNER_RECONCILIATION_AND_RUNTIME_RUNBOOK.md`](PROPERTY_OWNER_RECONCILIATION_AND_RUNTIME_RUNBOOK.md).
Migrations 035–037 are not claimed as applied to the canonical database, and no
Owner portal browser/runtime verification is claimed yet.

## Authority Order

When two sources disagree, use this order:

1. The product owner's latest explicit decision.
2. `OWNER_POLICY_DECISIONS_AND_GLOSSARY.md`.
3. The property owner's master-data source at
   `docs/18-public-hunian-catalog/master-data/master_data_kostation.md`.
4. `PRD.md`.
5. Domain, experience, data, API, billing, roadmap, and QA contracts in this
   directory.
6. `PRODUCT.md` and `DESIGN.md`.
7. Current source code as evidence of the implementation that exists today.
8. Historical milestone documents and external screenshots as references only.

An executor must not silently choose a lower authority because it is easier to
implement.

## Reading Order

1. [`PRD.md`](PRD.md) — product outcomes, users, scope, and functional
   requirements.
2. [`OWNER_POLICY_DECISIONS_AND_GLOSSARY.md`](OWNER_POLICY_DECISIONS_AND_GLOSSARY.md)
   — binding business rules and canonical terminology.
3. [`CONTEXT.md`](CONTEXT.md) — compact current ubiquitous language for
   Booking Fee, DP, deposit, lease, and occupancy.
4. [`DOMAIN_LIFECYCLE_CONTRACTS.md`](DOMAIN_LIFECYCLE_CONTRACTS.md) — state
   machines and cross-domain invariants.
5. [`DATABASE_ARCHITECTURE.md`](DATABASE_ARCHITECTURE.md) — concise visual
   current/target/transition database architecture.
6. [`DATA_MODEL_AND_MIGRATION.md`](DATA_MODEL_AND_MIGRATION.md) — detailed target
   persistence, compatibility, backfill, and reconciliation.
7. [`SCHEMA_IMPLEMENTATION_LEDGER.md`](SCHEMA_IMPLEMENTATION_LEDGER.md) — living
   source, migration, canonical database, reconciliation, and consumer status.
8. [`DATA_AUTHORITY_MATRIX.md`](DATA_AUTHORITY_MATRIX.md) — source-of-truth and
   explicit non-authority matrix.
9. [`ADMIN_INFORMATION_ARCHITECTURE.md`](ADMIN_INFORMATION_ARCHITECTURE.md) —
   Admin navigation, pages, forms, and operational flows.
10. [`PUBLIC_AND_PENGHUNI_EXPERIENCE.md`](PUBLIC_AND_PENGHUNI_EXPERIENCE.md) —
    public catalog and authenticated Penghuni application.
11. [`PROPERTY_OWNER_SCOPE_AND_EXPERIENCE.md`](PROPERTY_OWNER_SCOPE_AND_EXPERIENCE.md)
    — mixed-asset ownership, read-only Owner access, and settlement authority.
12. [`PROPERTY_OWNER_PRIORITY_IMPLEMENTATION_PLAN.md`](PROPERTY_OWNER_PRIORITY_IMPLEMENTATION_PLAN.md)
    — the bounded, prioritized W10 ownership delivery sequence; planning only.
13. [`PROPERTY_OWNER_RECONCILIATION_AND_RUNTIME_RUNBOOK.md`](PROPERTY_OWNER_RECONCILIATION_AND_RUNTIME_RUNBOOK.md)
    — W10-D reconciliation boundary, controlled runtime QA, rollback, and release evidence.
14. [`API_AND_INTEGRATION_CONTRACT.md`](API_AND_INTEGRATION_CONTRACT.md) — API,
    transaction, idempotency, audit, file, cache, and adapter contracts.
15. [`BILLING_REMINDER_NOTIFICATION_REPORTING.md`](BILLING_REMINDER_NOTIFICATION_REPORTING.md)
    — detailed money, reminder, notification, expense, and report behavior.
16. [`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md) — dependency-ordered
    vertical slices.
17. [`QA_ACCEPTANCE_AND_RELEASE_GATES.md`](QA_ACCEPTANCE_AND_RELEASE_GATES.md) —
    required automated, migration, runtime, and release evidence.
18. [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md) — requirement ownership
    and implementation status.
19. [`EXECUTOR_REVIEWER_RUNBOOK.md`](EXECUTOR_REVIEWER_RUNBOOK.md) — execution
    and review protocol.
20. [`REFERENCE_ADAPTATION_LOG.md`](REFERENCE_ADAPTATION_LOG.md) — decisions
    derived from third-party screenshots and rejected reference behavior.

The architecture set has four distinct jobs: visual relationships live in
`DATABASE_ARCHITECTURE.md`, detailed target rules live in
`DATA_MODEL_AND_MIGRATION.md`, implementation truth lives in
`SCHEMA_IMPLEMENTATION_LEDGER.md`, and concept ownership lives in
`DATA_AUTHORITY_MATRIX.md`.

## Requirement Language

| Prefix                 | Meaning                                     |
| ---------------------- | ------------------------------------------- |
| `POL-<DOMAIN>-###`     | Property-owner policy                       |
| `DEC-<DOMAIN>-###`     | Product decision                            |
| `INV-<DOMAIN>-###`     | Cross-surface business invariant            |
| `FR-ADM-<DOMAIN>-###`  | Admin functional requirement                |
| `FR-PUB-<DOMAIN>-###`  | Public catalog functional requirement       |
| `FR-PEN-<DOMAIN>-###`  | Penghuni application functional requirement |
| `FR-POW-<DOMAIN>-###`  | Property Owner functional requirement       |
| `NFR-A11Y-###`         | Accessibility requirement                   |
| `NFR-REL-###`          | Reliability and consistency requirement     |
| `NFR-PERF-###`         | Performance requirement                     |
| `NFR-PRIV-###`         | Privacy and data-minimization requirement   |
| `NFR-OBS-###`          | Audit, event, and observability requirement |
| `QA-<DOMAIN>-###`      | Quality or release gate                     |
| `KMO-W##` / `KMO-W##A` | Delivery package and its named subpackage   |

Requirements use **must** and **must not**. Examples and screenshots are not
requirements unless a canonical requirement ID adopts their behavior.

## Status Vocabulary

`PROPOSED → APPROVED → IN_PROGRESS → IMPLEMENTED → AUTOMATED_VERIFIED → RUNTIME_VERIFIED`

Additional terminal classifications:

- `DEFERRED`: intentionally postponed.
- `BLOCKED`: cannot proceed without an external decision or prerequisite.
- `SUPERSEDED`: replaced by a newer authority.
- `REJECTED`: evaluated and intentionally excluded.

All requirements in this package start as `APPROVED` planning unless the
traceability matrix says otherwise. Current code can satisfy a requirement, but
the status may only advance after the named tests and evidence are rerun against
the final slice.

## Binding Program Boundaries

- The overhaul includes Admin, public `/kamar`, the authenticated Penghuni app,
  and the asset- and ownership-period-scoped Property Owner experience.
- The overhaul covers every current sidebar surface, including facilities,
  gallery, terms, payments, vehicles and parking, complaints, notifications,
  reports, settings, Smart Lock, CCTV, and access history.
- Smart Lock live commands, CCTV live integration, payment gateway activation,
  automatic WhatsApp delivery, and automatic email delivery remain gated or
  deferred. Their existing source must not be interpreted as permission to turn
  them on.
- External screenshots are functional references, not visual or domain
  authority. Labels, columns, status names, and navigation are normalized to
  KOSTATION.
- The implementation must be delivered as coherent vertical slices. A
  repository-wide big-bang change is prohibited.

## Supersession Register

This package supersedes contradictory future-state statements in:

- `docs/hotfixes/REVISI_UX_ADMIN.md`;
- the three untracked `docs/plans/ADMIN_UX_*` planning documents;
- historical M16–M20 public catalog, Booking Lead, and gallery planning where
  this package explicitly extends or changes a deferred capability;
- screenshot-specific terminology such as `cabang`, `tenant`, `konversi`,
  `survey`, hard delete, generic `Pemasukan`, and generic `Penyewaan` sidebar
  navigation.

Those files remain valuable implementation evidence and history. They are not
deleted or rewritten by this planning pass.

## Executor Entry Conditions

Before starting a work package, the executor must:

1. Select one roadmap package and freeze its requirement IDs.
2. Audit current code and database truth for those IDs.
3. Declare the exact allowlist, dependencies, migrations, fixtures, and
   prohibited mutations.
4. Create RED evidence that fails for the missing behavior.
5. Implement the smallest coherent vertical slice.
6. Satisfy the package's automated and runtime gates.
7. Update the traceability matrix and evidence paths in the same documentation
   checkpoint or an immediately following documentation-only commit.

An executor must not report `READY FOR FINAL REVIEW` while an in-scope behavior,
test, migration, reconciliation, or self-review finding remains unresolved.

## Screenshot Policy

Additional screenshots are not required to implement behavior already specified
here. They are useful only when:

- a new workflow not covered by this package is discovered;
- the product owner wants an exact visual composition rather than behavior;
- a reference exposes a requirement that is absent from the traceability
  matrix; or
- runtime evidence is needed to demonstrate a defect.

Written requirements and KOSTATION authorities always outrank screenshots.
