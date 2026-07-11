# Admin UX — M0 Preflight & Remediation Result

> **Status: PASS — staging data gate closed on 2026-07-11.**
>
> M2 may begin, subject to the already-approved Admin UX contract. This result does
> not enable feature flags or replace M2 RBAC/migration gates.

## Approved decisions applied

- Apart Kost uses one canonical set of eight facilities: AC, Kamar Mandi Dalam,
  Kasur, Kursi, Lemari, Meja, Water Heater, and WiFi.
- Eight active occupancies with room status vacant were reconciled by making the
  associated rooms occupied. No occupancy, invoice, payment, or lease was
  created.
- AK-18D-A-013 and AK-18D-A-015 were confirmed empty and reconciled from
  occupied to vacant. No occupancy was created.
- Invoice, payment, payment allocation, KTP/file, gallery, price, deposit,
  yearly price, and room type were immutable during this remediation.

## Backup and rehearsal evidence

| Control | Result |
|---|---|
| Staging backup | PostgreSQL custom archive created with restrictive file permission. |
| Backup SHA-256 | 687c1f06460abebd67f54cd270a7a01d86a19ee7bbb230c5ef8b39ffabd17bf3 |
| Archive integrity | pg_restore list completed with 562 entries. |
| Isolated restore | Restored to a temporary local PostgreSQL clone, then removed after verification. |
| Clone baseline | 163 rooms, 8 occupancies, 8 invoices, and 2 payments. |
| Clone rehearsal | Transaction completed; all postcondition mismatch counts were zero. |

## Staging transaction evidence

The staging transaction used serializable isolation, a transaction-scoped advisory
lock, table locks, baseline assertions, an atomic audit log, and postcondition
assertions. It made the following scoped changes:

| Change | Result |
|---|---|
| Legacy Apart Kost facility assignments removed | 8 |
| Canonical assignments inserted | 320 (40 rooms × 8 facilities) |
| Active occupancy room status sync history inserted | 8 |
| Empty occupied rooms corrected to vacant | 2 |
| Remediation audit event | 1 |

Correlation ID: `admin-ux-m0-20260711-001`.

## Final M0 read-only preflight

| Check | Result |
|---|---:|
| Category/building/room mismatch | 0 |
| Price/deposit/yearly/room type non-uniform groups | 0 |
| Facility non-uniform groups | 0 |
| Cross-property facility assignments | 0 |
| Active occupancy with room not occupied | 0 |
| Occupied room without active occupancy | 0 |
| Invoice property-scope mismatch | 0 |
| Payment allocation orphan | 0 |
| Gallery/file mismatch | 0 |
| Invoice count | 8 |
| Payment count | 2 |
| Payment allocation count | 2 |
| Remediation audit records | 1 |

## RBAC carry-forward to M2

- `billing.manage` remains granted only to `owner` and `manager`.
- `lease.read` remains absent at M0 by design. Migration/seed M2 must add it
  only to `owner`, `manager`, and `admin`; it must not be granted to
  `property_owner` or `technician`.

## M2 entry gate

M0 is closed. The first M2 implementation work is the forward-only master-data
migration and API compatibility layer defined in
`ADMIN_UX_FINAL_INTEGRATION.md` and `ADMIN_UX_DB_API_DESIGN.md`.
