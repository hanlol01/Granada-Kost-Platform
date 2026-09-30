# ADR-0007: Akses Progres dan Dokumen Realisasi pada Portal Property Owner

- **Status:** Accepted planning decision — implementation not started
- **Date:** 2026-09-30 (Asia/Jakarta)
- **Supersedes:** Owner Portal visibility restriction that allowed only
  explicitly published, fully realized records
- **Scope:** Property Owner Portal read experience for Owner Realization

## Context

Admin currently has to download a per-Owner realization detail and send it
manually to the Property Owner. The Owner Portal already has the correct
ownership boundary but does not expose the Owner's realization progress.

The business requires an Owner to follow a selected monthly period before the
Admin closes and publishes it, while preserving the distinction between a live
informational projection and an official published financial record.

## Decision

The Owner Portal will expose one read-only realization workspace with two
states for the same monthly period:

1. **Progress sementara** — calculated from current authoritative records and
   updated whenever the Owner opens the page or presses **Perbarui data**.
2. **Realisasi diterbitkan** — the immutable published realization snapshot,
   including transfer and receipt state when those facts exist.

The single **Lihat rincian realisasi** action opens the Owner-scoped detail page
and renders the appropriate state. It is not a modal and does not require the
Owner to understand internal Admin routes or identifiers.

This decision supersedes the previous rule that the Owner Portal could read
only published, fully realized records. It does **not** supersede any of these
rules:

- the authenticated Owner may read only their effective ownership scope;
- Owner access remains read-only and has no Admin commands;
- unpublished data must not reveal internal review notes, checksums,
  methodology, raw payment proof, storage paths, or another Owner's data;
- a published financial record remains immutable and corrections are linked
  append-only records;
- a transfer is not considered successful until a successful transfer fact is
  recorded.

## Period and state behavior

- The selector is a monthly Owner Realization period, for example **September
  2026**. Future empty periods are not shown as actionable periods.
- Before publication, only contracts currently eligible for realization are
  shown. Newly verified and fully paid rooms appear after the next page load or
  explicit refresh.
- Before a successful transfer, **Sudah ditransfer** is always `Rp 0` even if
  the realization has been published.
- After a successful transfer, the detail shows the recorded amount, transfer
  date, method, reference, and cumulative remaining amount.
- If the Admin publishes a realization that is still awaiting transfer, the
  Owner sees **Realisasi diterbitkan · Menunggu transfer**.
- If the Admin cancels or corrects a record, the Owner sees the resulting
  status, reason, and effective time; the original financial evidence is not
  silently removed.

## Documents and downloads

The Portal reuses the existing server-side Admin document/query builders. It
does not create a second calculation or template family.

| State | Available documents |
| --- | --- |
| Progress sementara | PDF/Excel **Laporan progres sementara** generated from one server snapshot |
| Published realization | PDF/Excel **Rincian Realisasi Owner** from the published snapshot |
| Successful transfer | Per-transaction **Kuitansi Realisasi Hak Owner** and permitted transfer evidence |

Every progress download includes its generation timestamp and is clearly
labelled as non-final. Owner-facing documents omit Admin-only audit metadata.

## Transfer proof and account information

- Each successful transfer may expose a scoped **Lihat bukti transfer** action.
- If no evidence exists, show **Bukti digital belum tersedia** without blocking
  the receipt or detail download.
- The Portal shows Bank, Account Holder, and the final four account digits.
  The complete account number remains Admin-only, consistent with the existing
  Owner policy.
- Missing payout data is shown as **Belum diisi** and does not block a progress
  download.

## UI and refresh requirements

The Owner dashboard receives a dedicated realization card containing:

- monthly period selector;
- current state badge;
- total eligible rooms and Owner entitlement;
- total successfully transferred;
- bank destination summary;
- **Perbarui data**;
- **Lihat rincian realisasi**;
- document download actions appropriate to the state.

The page refreshes on open and on explicit refresh. Real-time polling is not
required for the first implementation.

## Security and acceptance boundaries

- All Portal queries must derive scope from the authenticated Owner Profile on
  the server; frontend filtering is not authorization.
- Empty ownership scope returns an empty result without disclosing whether
  another Owner has data for the same period.
- Download and evidence endpoints must use scoped authorization and must not
  expose raw storage URLs.
- Admin and Owner documents must consume the same server snapshot, totals, and
  row eligibility for a given request.

