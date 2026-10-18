# Resident Checkout Attention Notifications Plan

Status: **APPROVED TARGET — IMPLEMENTATION PENDING**
Decision date: **18 October 2026**
Scope: the Admin `/tenants` notification card, its property-scoped summary, and
the matching resident-list drill-down filters.

## 1. Purpose

Admin needs a complete, actionable view of resident tenancies that are still in
an open checkout outcome. The notification card must distinguish operational
checkout work from financial follow-up without changing checkout, settlement,
refund, invoice, room, or occupancy authorities.

The notification card is a read model. It does not create, advance, cancel, or
complete a checkout command.

## 2. Approved notification categories

The following checkout categories appear only when their count for the selected
property is greater than zero.

| Category key | Admin label | Matching derived state | Meaning |
| --- | --- | --- | --- |
| `checkout_in_progress` | **Proses check-out berjalan** | `in_progress` | A checkout command exists and still needs inspection or final settlement work. |
| `awaiting_handover` | **Menunggu tanggal serah-terima** | `awaiting_handover` | A physical handover has been scheduled for today or a future Jakarta business date. |
| `handover_overdue` | **Terlambat serah-terima** | `handover_overdue` | The recorded handover date has passed and physical handover is not recorded. |
| `refund_pending` | **Menunggu pengembalian dana** | `refund_pending` | Checkout settlement is complete and a refund still awaits settlement or transfer. |
| `amount_due` | **Tagihan akhir belum lunas** | `amount_due` | A final checkout invoice still has an unpaid balance. |

`checkout_in_progress` covers the open command states `notice_received`,
`inspection_required`, and `settlement_pending` through the existing derived
`in_progress` projection. A scheduled handover is intentionally excluded from
this category because it has its own operational notification.

The pre-existing tenant notifications remain available:

- **Masa sewa berakhir** remains a separate alert for an expired active lease
  before checkout work is started.
- **Masa sewa segera berakhir**, **Pembayaran sewa belum lunas**, and
  **Menunggu aktivasi** retain their current predicates and meaning.

## 3. Closed-state boundary

The notification card does not show completed checkout cases where no action is
left for Admin:

- financial status `closed`;
- refund status `settled`; and
- refund status `waived`.

A checkout command may be operationally complete while its finance outcome
remains open. Therefore, a completed command with a pending refund or an unpaid
final invoice must still appear in **Menunggu pengembalian dana** or **Tagihan
akhir belum lunas**. This preserves the domain rule that physical checkout and
financial settlement are separate authorities.

## 4. Count and drill-down contract

`resident-attention.sql.ts` remains the single predicate source for all three
uses of a category:

1. property-wide notification count;
2. resident-list query; and
3. resident-list count.

Each card count covers the selected property, regardless of the table's search,
pagination, or temporary filters. Selecting a notification card:

1. preserves the selected property;
2. clears conflicting resident-table filters;
3. applies the exact `attention_category` predicate; and
4. scrolls to the resulting table after the data load completes.

The resident table retains the existing **Status penyelesaian check-out** filter
for direct, one-status investigation. The notification card supplies an
action-oriented entry point; it does not replace the filter.

## 5. API and Admin requirements

- Add `checkout_in_progress` to the shared attention-category registry,
  validation DTO, summary contract, list query, and count query.
- Use the existing `checkout_financial_status='in_progress'` derived status as
  the predicate. Do not duplicate lifecycle state calculations in the Admin
  application.
- Change only the Admin-facing copy for `refund_pending` from
  **Pengembalian dana tertunda** to **Menunggu pengembalian dana**.
- Render the new card using the established notification-card interaction,
  accessibility, property scope, and filter-reset behavior.
- Keep the current `attention` checkout-status filter available because it is a
  broad diagnostic filter; it is not the predicate for any individual card.

## 6. Non-goals

- No database migration, data backfill, seed, payment mutation, or checkout
  mutation is required.
- No checkout state is introduced or renamed in persistence.
- No completed settlement, refund, invoice, audit event, occupancy record, or
  room state is rewritten.
- This does not change the notification behavior in reports, the Owner portal,
  or the resident-facing application.

## 7. Acceptance scenarios

| Scenario | Expected notification result |
| --- | --- |
| Notice, inspection, or final-settlement work is still open. | Appears in **Proses check-out berjalan** and its card drill-down. |
| Handover is scheduled today or later. | Appears in **Menunggu tanggal serah-terima** only among the checkout operational categories. |
| Scheduled handover date is before the current Jakarta business date. | Appears in **Terlambat serah-terima**. |
| Final settlement results in a refund that has not been settled. | Appears in **Menunggu pengembalian dana**. |
| Final invoice has an unpaid balance. | Appears in **Tagihan akhir belum lunas**. |
| Refund is settled or waived, or settlement is closed with no remaining balance. | Does not appear in a checkout notification category. |
| A card is selected after the table has filters or pagination applied. | The selected-property count and table rows use the same predicate; conflicting filters are reset and the table is brought into view. |

## 8. Verification requirements

- Add focused API tests proving every category predicate returns the same set
  through the summary and list endpoints.
- Add focused Admin tests for the new card label, `refund_pending` label, and
  card-selection filter behavior.
- Run the relevant API and Admin checks after implementation.
- Perform a browser check with representative in-progress, scheduled,
  overdue-handover, refund-pending, amount-due, and closed checkout records.
