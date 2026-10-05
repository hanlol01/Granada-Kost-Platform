# ADR 0008: Separate lease cancellation from physical file deletion

- Status: Accepted — implemented and verified locally; not deployed to production
- Date: 2026-10-02

Local implementation and requirement-level evidence are recorded in
[Handoff 08 progress](../21-kost-management-ecosystem-overhaul/handoff/08_LEASE_REVISION_IMPLEMENTATION_PROGRESS.md).
The approved local migration/restart and user-confirmed Admin report file-save
acceptance completed on 5 October. Production preflight/deployment requires
separate authorization; the progress document distinguishes automatic evidence
from manual confirmation and records the local API handoff.

## Context and decision

Admins need to remove an erroneous lease from active workflows without
pretending that the resident completed checkout. Admins also need to free
uploaded-file storage while keeping financial records, including when money is
handled outside the system. Therefore, “delete a lease” must not mean a
cascading `DELETE` of lease, resident, payment, receipt, and audit records.

KOSTATION separates **Batalkan dan Arsipkan Penyewaan** from **Hapus Berkas
Permanen**. The first ends the active lifecycle with a reason and audit trail
while retaining transaction facts. The second, when requested from an archive,
deletes only uploaded bytes exclusively owned by that lease after preview and
confirmation; tombstone metadata and financial facts remain. Shared or
protected files are excluded. Checkout remains the workflow for an occupancy
that actually ended. Bulk or age-based automatic purging has not been decided.

## Consequences

- Archived leases remain auditable and readable. Restoration validates room
  availability and does not silently reverse financial transactions.
- Physically purged files cannot be downloaded or restored with the lease.
  The UI explains why and when evidence is no longer available.
- Existing file soft-delete metadata does not free disk space. Implementation
  requires an audited physical-delete operation that handles partial failure.
- Documents regenerated from transaction records follow document-validity
  rules; they are not treated as stored files to purge.
- Eligibility, preview, rejection messages, and verification are specified in
  [Handoff 08](../21-kost-management-ecosystem-overhaul/handoff/08_LEASE_CORRECTION_CANCELLATION_ARCHIVE_PURGE_PLAN.md).
