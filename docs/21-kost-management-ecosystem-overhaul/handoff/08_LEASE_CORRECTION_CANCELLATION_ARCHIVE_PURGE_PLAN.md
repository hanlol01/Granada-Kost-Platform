# Handoff 08: Comprehensive lease correction, cancellation, archive, and file purge

Status: `IMPLEMENTED AND VERIFIED LOCALLY — NOT DEPLOYED TO PRODUCTION`
Decision date: 2 October 2026

Execution started on 3 October 2026. See [implementation progress and evidence](08_LEASE_REVISION_IMPLEMENTATION_PROGRESS.md).
The full approved source scope is implemented and core local checks pass.
The main local database received migrations 115–124 and the matching API was
restarted on 5 October. The user confirmed local Admin report PDF/Excel saving
and opening, closing the remaining manual acceptance gate. Automated native
download capture remains a tooling limitation, not claimed browser evidence.
Read the progress document's final evidence and release boundary before
continuing acceptance or deployment. The approved scope and domain boundaries
below remain unchanged.

## Purpose and scope

Admins need to correct onboarding mistakes through a staged page similar to
**Tambah Penyewaan**, without deleting a resident or overwriting history. For
an erroneous lease, Admins need to cancel and archive it without using the
five-stage checkout flow. From the archive, Admins can review restoration or
request physical deletion of files exclusively associated with that lease.

This document records product decisions and implementation gates. It does not
mean the features are available. Do not change data, run migrations, or deploy
because this plan exists. [Handoff 03](03_LEASE_DATA_CORRECTION_HANDOFF.md),
[Handoff 04](04_OWNER_SPONSORED_OCCUPANCY_HANDOFF.md),
[ADR 0003](../../adr/0003-lease-data-correction-as-versioned-amendment.md),
and [ADR 0008](../../adr/0008-lease-archive-and-file-purge-boundary.md) remain
the audit and domain boundaries.

## Terms and fixed decisions

- **Koreksi Data Penyewaan** corrects a fact recorded incorrectly. Each commit
  is a versioned amendment with before/after values, reason, actor, time, and
  financial impact; existing payments and documents are not silently deleted.
- **Pindah Kamar** records a physical room move that actually happened. A room
  entry mistake must not create a fictitious move event.
- **Batalkan dan Arsipkan Penyewaan** removes an erroneous lease from active
  workflows while preserving its readable record, audit trail, and transaction
  relationships. It is neither checkout nor permanent deletion of all records.
- **Pulihkan Penyewaan** returns an archived lease to an active workflow only
  after room, lifecycle, and transaction validation. It does not revive
  reversed transactions.
- **Hapus Berkas Permanen** deletes selected upload bytes owned exclusively by
  that lease. Transaction facts and deletion metadata remain. It does not mean
  deleting a resident, lease, or database record.
- These rules apply to both paid rentals and **Hunian Tanggungan Owner**. Both
  use the same occupancy lifecycle but have different financial obligations.

## Current state to verify at implementation start

- The correction backend accepts leases in `awaiting_activation` and `active`;
  activation/check-in alone is not a restriction. An in-progress or completed
  checkout still blocks correction. If an action is unavailable for a specific
  resident, investigate the actual state, permission, and checkout command
  instead of inferring a new policy from the UI symptom.
- Current correction supports lease start date, duration, an already-recorded
  check-in date, and standard/agreed pricing. The API does not yet accept room,
  `commercial_mode`, sponsor, or management-fee policy changes.
- Pre-activation commitment cancellation exists only in part of the booking
  flow. A general lease archive, restore, or delete command does not exist.
- Uploaded files have metadata and a `storage_path` in the `files` table and
  bytes in local storage. The current file-delete command only marks metadata
  deleted; it does not free disk space. Payment receipt PDFs are generally
  generated on demand from transaction facts, not stored as PDF files that can
  be purged from disk.

Re-verify these source findings at implementation start. The KOSTATION codebase
graph was unavailable during planning.

## A. Koreksi Data Penyewaan page

### Admin flow

1. From resident detail, Admin opens **Koreksi data penyewaan** on a dedicated
   breadcrumb page, not a long dialog. Preserve a return link and the identity
   of the resident and lease being corrected.
2. Reuse the **Tambah Penyewaan** component patterns and sequence: resident/room,
   period and check-in, pricing, occupancy mode and management fee, then review.
   Do not create a second calculation authority in the frontend.
3. The reviewable inputs are start date, duration, actual check-in date when
   relevant, correct room, standard or agreed tariff, paid rental or **Hunian
   Tanggungan Owner**, sponsor, and management-fee policy (`charged`/`waived`,
   payer, and reason).
4. Admin may **leave the room unchanged**. This means the existing room remains
   assigned; it does not release the room. If Admin selects a replacement room,
   final save must validate availability and Owner scope. A committed lease
   with current occupancy must never become roomless because a form field was
   cleared.
5. Server preview shows before/after values and impacts: end date, room and
   occupancy state, tariff/contract value, invoice/adjustment/credit, verified
   payments, management fee, Owner entitlement, documents whose validity
   changes, and actions that must be handled outside this correction.
6. Admin enters a required reason, reviews the changes, and confirms commit.
   Commit repeats validation atomically on the server and is idempotent. The
   result appears in **Riwayat Koreksi Penyewaan** and the relevant room
   activity.

### Correction boundaries

- A fact that was genuinely recorded incorrectly may be corrected after
  check-in through an amendment, but real events and transactions must not be
  replaced as if they never happened. A new commercial agreement needs a new
  effective date; it must not be disguised as a retroactive correction.
- A room mistakenly selected before occupancy may be corrected after conflict
  checks. After real occupancy, a physical move uses **Pindah Kamar**. A room
  that was wrong in the original record uses an administrative correction with
  a reason and evidence, not a fictitious transfer.
- The existing room-transfer flow does not support `owner_sponsored`. Do not
  silently run a paid-rental transfer for that case. Add a sponsor-aware stage
  or clearly reject the operational move until that stage exists.
- A change between `rent` and `owner_sponsored` may be reviewed in full before
  financial effects exist. If payment, recognized income, management fee, or
  Owner realization is already linked, the server must first show the valid
  settlement/reversal required; changing one column is insufficient. If no
  safe settlement path exists, reject commit and explain the next action.
- Changing the sponsor, fee payer, or `charged`/`waived` policy within
  `owner_sponsored` requires the same historical-impact checks. Verified fee
  payments cannot disappear when a policy changes to `waived`; preserve the
  historical payer and Owner. New decisions use effective-dated records rather
  than overwriting historical payment or policy facts.
- ADR 0003 restrictions remain: in-progress/completed checkout, start date
  after actual check-in, an elapsed end date, and room conflicts block
  correction unless a new explicit domain decision supersedes them. Existing
  receipts and verified payments are not deleted by correction.

## B. Cancel and archive a lease

This is a separate flow from correction and checkout. The available actions
must follow server-side validation, not only the status shown in the UI.

| Condition | Planned outcome |
| --- | --- |
| Not checked in; no payment | Cancel the commitment, release the room hold transactionally, record reason and audit history, and archive the lease. |
| Not checked in; transaction exists | Record cancellation and financial-resolution state. Reversal, invoice, or refund follows its own authority. Archiving does not automatically remove transactions or evidence. |
| Marked active, but never occupied (mistaken activation) | Exception path with required reason, a second confirmation, and checks for occupancy, documents, money, and Owner realization. Do not release the room until facts are verified. |
| Actually or previously occupied | Correct inaccurate data or use checkout for a real ended occupancy. Do not hide real occupancy as a fictitious lease. |
| Checkout completed or Owner realization published | Keep history readable. Financial or realization changes use a dedicated reversal/amendment authority, not quick deletion. |

Archiving hides the lease from active lists and prospective calculations once
effective. Historical data, invoices, payments, receipts, and published report
trails remain available according to authorization. A lease and a resident
profile are separate entities: archive the profile only if that resident has
no other active or awaiting-activation lease. Never delete a resident profile
with one lease without checking all relationships.

Before confirmation, show room, period, occupancy state, commercial mode,
amounts in Rupiah, related evidence/documents, room consequences, and any
pending financial action. If money remains unresolved, show **Menunggu
penyelesaian keuangan**; do not imply that a refund has happened. Handling money
outside KOSTATION does not erase facts already recorded in the application.

## C. Archive and restore

- Provide an archive workspace with search/filter, occupancy mode, reason,
  cancellation time/actor, room state, financial-resolution state, file count,
  and a read-only detail view. Old receipts and events remain reviewable while
  their underlying file bytes have not been removed.
- **Restore directly** only when the archived lease has no related financial
  transaction and the room/period is still available. Revalidate Owner
  assignment, tariff, mode, billing, and resident state before commit.
- If the room has been reused or a transaction has been reversed/refunded, do
  not automatically revive the old lease, reservation, or obligation. Offer a
  new lease linked to the archived record as its source; keep the old archive
  read-only.
- **Perbaiki dari arsip** opens a guided review. If direct restoration is
  eligible, restore and continue with a versioned correction. Otherwise explain
  why and offer a linked new lease. Do not apply correction directly to an
  archive whose financial transaction was cancelled.

## D. Permanently purge files from an archive

The user decision is to retain resident, lease, transaction, and audit text
while allowing permanent deletion of selected uploaded bytes. Admin may
request this immediately from one archive. No age-based auto-purge and no
**hapus semua arsip** action are planned for the first stage.

1. Show a file inventory: type, safe filename, size, related transaction/record,
   whether it is the only digital evidence, and the total space that could
   potentially be freed. Preview is read-only.
2. Only files exclusively owned by this lease may be selected. Room photos,
   identity files used by another relationship, Owner-realization transfer
   evidence, and shared/protected files are excluded. A rejection names the
   relationship protecting the file.
3. Explain that deleted evidence cannot be viewed, downloaded, or restored by
   restoring the lease. Require explicit confirmation for the archive and show
   file count and size. Handling finance outside the system is not automatically
   equivalent to retaining digital evidence.
4. Backend commands must be authorized, idempotent, audited, and resilient to
   partial failure between the database update and physical deletion. Record
   results **per file**: deleted, failed, or retry pending. Never report a file
   deleted until physical removal is verified. If deletion cannot be verified,
   mark it `retry pending`; do not claim the bytes remain or have been removed.
   A multi-file request may finish partially; explain the exact count and list.
   Record a tombstone for each successful purge: type/relationship, actor, time,
   reason, and purge status.
   Remove download links for missing bytes. Retry only failed/pending files and
   preserve successful results. Report disk space freed only for verified
   deletions.
5. A receipt PDF generated from transaction records is not a purge target if it
   is not physically stored. Regeneration follows document validity rules; if
   supporting evidence was purged, show that state honestly on transaction
   detail.

There is no automatic permanent deletion by archive age. No retention duration
has been decided. Retention/personal-data reduction policy and bulk actions are
separate decisions, not implied by this handoff.

## E. Actionable messages, confirmations, and failures

All flows use clear operational Indonesian. Every message must explain **what
failed, why, and what Admin can do next**. The server returns stable business
error codes and safe details; the UI maps them to a concise toast, a persistent
field/action summary, and focus on the first error. Do not expose constraint
names, SQL, raw UUIDs, or only “Internal server error” for expected business
rejections. Unexpected failures provide a retry instruction and an incident
code for support.

| Case | Example user-facing message |
| --- | --- |
| Room conflict during correction | “Kamar RK-06-06 sudah digunakan pada periode ini. Pilih kamar lain atau ubah periode, lalu tinjau ulang.” |
| Inconsistent check-in facts | “Tanggal mulai baru melewati check-in aktual. Pilih tanggal mulai yang sesuai atau tinjau catatan check-in.” |
| Commercial mode affected by transactions | “Jenis hunian belum dapat diubah karena pembayaran telah terverifikasi. Tinjau penyelesaian pembayaran sebelum melanjutkan.” |
| Real occupancy submitted as a mistaken lease | “Kamar sudah dihuni. Gunakan Koreksi Data untuk pencatatan yang salah, atau Check-out bila hunian berakhir.” |
| Restore conflict | “Penyewaan belum dapat dipulihkan karena kamar sudah digunakan. Arsip tetap aman; buat penyewaan baru dengan kamar yang tersedia.” |
| Shared/protected file | “Bukti ini juga digunakan oleh transaksi lain. Berkas tidak dihapus; tinjau hubungan yang ditampilkan.” |
| Partial or unverified physical deletion | “2 dari 3 berkas terverifikasi telah dihapus. Status penghapusan bukti transfer belum dapat dipastikan karena penyimpanan tidak merespons. Coba ulang untuk memeriksa dan menyelesaikan berkas tersebut. Berkas yang telah dihapus tidak dapat dipulihkan.” |

Success messages are equally specific: **Koreksi tersimpan**, **Penyewaan
dibatalkan dan masuk arsip**, **Penyewaan dipulihkan**, or **N berkas dihapus
permanen**. Include count and context; do not claim the financial process is
complete while it is unresolved. Irreversible confirmation states the lease
identity and consequences and names the selected file count. A toast must not
be the only place for a long rejection explanation.

## Implementation stages and verification gates

Implement separate vertical slices; do not combine all actions into one
migration, endpoint, or button.

1. **Discovery**: map lease–resident–occupancy–room–billing–Owner–file
   relationships, reusable booking cancellation behavior, and legacy data.
   Define state transitions, authorization, and preview/commit contracts first.
2. **Staged correction page**: move UI out of the dialog, preserve current
   correction, add agreed fields with server calculations and before/after
   tests. Cover paid/sponsored, pre/post check-in, room conflicts, negotiated
   tariff, invoice credit/charge, and historical documents.
3. **Cancellation and archive**: separate command with reason/confirmation,
   real occupancy vs mistaken activation classification, financial state,
   safe room release, archive filters, and history. Test mid-command failure
   so a room cannot be free while its lease remains active, or vice versa.
4. **Restore/successor lease**: test room reuse, reversals/refunds, changed Owner
   assignment, another lease for the same resident, and retries.
5. **File inventory/purge**: test exclusive vs shared/protected files, physical
   delete success/failure including partial success, per-file retry, tombstones,
   download authorization, disk space, and receipt generation from records.
6. **UX and release**: verify actionable messages on desktop/mobile/keyboard,
   loading, confirmation, repeated-click idempotency, audit, Admin access,
   Penghuni/Owner/report projections, migration on disposable database,
   builds, and rollback. Production migration and deployment require separate
   authorization.

For each stage, state the file/migration allowlist, failing test evidence
before the fix, and passing evidence. Do not use generic toasts for expected
business errors or claim that soft-deleted metadata freed disk capacity.
