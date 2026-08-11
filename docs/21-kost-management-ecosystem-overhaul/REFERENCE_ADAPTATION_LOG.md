# External Reference Adaptation Log

Status: **APPROVED PLANNING — NOT IMPLEMENTED**

## 1. Purpose

The product owner supplied screenshots from other boarding-house and rental
websites to explain desired behavior. Those images are not KOSTATION design,
schema, status, access, or policy authority.

This log records what was adopted, adapted, or rejected so executors do not copy
an external product literally or lose the underlying requirement.

KOSTATION visual implementation follows [`DESIGN.md`](../../DESIGN.md).

## 2. Interpretation Rules

- Adopt the operational need, not the external styling.
- Replace `cabang` with KOSTATION property or building scope as appropriate.
- Replace generic `penyewa/tenant` with canonical `resident`, `lease`, or
  `Booking Lead` according to lifecycle.
- Replace destructive delete with reversal, archive, close, or deactivate when
  history exists.
- Replace local table totals with authoritative server totals.
- Replace exact-room public selection with category/gender qualification.
- Replace provider claims with honest MVP states.
- Do not reproduce external logos, copy, proprietary assets, or exact layouts.

## 3. Public Catalog References

### Reference Behavior

- Promotional landing hero.
- Search controls.
- Category/type selection.
- Image-led housing cards and detail gallery.
- Clear price and CTA.

### KOSTATION Adaptation

- Public `/kamar` remains no-login and property-specific.
- Search is not location search because KOSTATION is not a national
  marketplace.
- Filters are category, gender, planned move-in, and intended term/payment
  context.
- Results show category-level content and approximate availability.
- Detail shows gallery, facilities, price policy, gender policy, public terms,
  and Booking Lead CTA.
- Public users never select or see an exact room number.

### Rejected

- Nationwide location or landmark search.
- Daily hotel-style date booking.
- Favorite/share behavior without a KOSTATION requirement.
- Exact room reservation by a public visitor.
- External site's visual brand, labels, and room-capacity assumptions.

## 4. Room Inventory and Detail References

### Reference Behavior

- Summary cards act as category filters.
- Dense room table.
- Side panel showing a quick room summary.

### KOSTATION Adaptation

- Summary cards remain useful filter shortcuts.
- Add search across room number, building, and category.
- Add category, status, gender, building, floor, and reconciliation filters.
- Table columns prioritize room, building, category, gender, status, resident
  summary, and actions.
- Price is removed from the table.
- A small quick preview may remain, but canonical detail becomes a full page
  with breadcrumbs.
- Full detail includes physical inventory, category pricing/facilities, active
  resident, lease, vehicle, billing progress, complaints, ownership, and quick
  links.
- Routine Add Room is removed because inventory is fixed.

### Rejected

- Side sheet as the only detail.
- Room-level commercial price drift.
- Routine room/building creation.
- Showing sensitive resident detail in a scan table.

## 5. Resident List and Detail References

### Reference Behavior

- Expandable table row with lease and arrears summary.
- Detail page combining resident, room, lease, and billing.
- WhatsApp shortcut.
- Edit/detail/delete actions.

### KOSTATION Adaptation

- `/tenants` is the resident-and-lease hub.
- Table: number, resident, room, university, lease duration/end, account/lease
  status, actions.
- Expandable row: end date, unpaid count/amount, payment standing, and safe note.
- Full resident page includes complete authorized profile, room/lease, billing,
  vehicles, complaints, reminders/notifications, and activity timeline.
- WhatsApp is a user-initiated link using the normalized resident number.
- Actions are Detail, Edit, and contextual More.
- A true unused draft/error record may be deleted; historical residents are
  archived or deactivated.

### Rejected

- Permanent deletion of a resident with lease, payment, complaint, vehicle, or
  audit history.
- Dialog-only complete detail.
- Full KTP/identity in the list.
- Separate duplicate primary Penyewaan sidebar.

## 6. Resident and Lease Onboarding Reference

### Reference Behavior

- Two-stage “Resident & Lease” and “Choose Room.”
- Searchable resident selection.
- Inline quick-add resident.
- Room table with one selection and summary.
- Final confirmation checkbox.

### KOSTATION Adaptation

- Full-page `/tenants/new` with breadcrumbs.
- Supports Booking Lead conversion and direct onboarding.
- Stage one collects or pre-fills resident, education, parents/emergency,
  lease, term, DP/deposit, and notes.
- Stage two shows only vacant, property-scoped, gender-compatible rooms.
- Category buttons and search help narrow inventory.
- Exactly one room may be selected; selection can be cancelled before confirm.
- Summary shows category, room, authoritative rate, term/payment schedule,
  gender, floor, and deposit policy.
- **Commit Onboarding** atomically provisions the account, pending resident,
  awaiting-activation lease, billing authority, and reserved room without
  creating occupancy.
- **Activate Lease** later uses the server-side checklist and a separate atomic
  command to activate the resident/lease, occupancy, and occupied room.

### Rejected

- Saving only stage one as an active lease.
- Selecting a room before resident gender is known.
- Creating a resident login outside an authorized onboarding commitment, or
  treating account provisioning as occupancy activation.
- Treating Booking Lead status alone as occupancy authority.

## 7. Booking Lead References

### Reference Behavior

- Contact prospect through WhatsApp.
- Progress statuses.
- Select/hold a room.

### KOSTATION Adaptation

- Public lead starts with category/gender, not room.
- Admin quick lead may retain an exact-room preference.
- Lead creation never reserves.
- Admin confirms agreement, selects room, places optional 24-hour hold, records
  DP/deposit, and completes onboarding.
- Final successful state derives from active lease conversion.

### Rejected

- `survey` as a mandatory lifecycle.
- Generic `converted` action without an activated lease.
- Automatic room reservation on public submission.
- Exact room displayed in public form.

## 8. Lease Status Reference

### Reference Behavior

- Editable status such as pending, active, completed.

### KOSTATION Adaptation

- Status is derived from canonical commands and prerequisites.
- Draft/pending means onboarding not activated.
- Active requires valid lease, occupancy, room, resident/account, and financial
  checklist.
- Ended/closed requires checkout authority.
- Cancelled requires reason and no contradictory active occupancy.
- Transfer uses history/addendum rather than arbitrary status edit.

### Rejected

- Free-form status dropdown that bypasses lifecycle.
- Manual “active” without room and lease activation.
- Manual “completed” while balances/access/inspection remain unresolved.

## 9. Billing Summary and Tabs Reference

### Reference Behavior

- Summary block for unpaid, paid, total, lease dates, remaining days, notes.
- Tabs for unpaid, paid, unconfirmed, and other payments.
- Payment table and quick action.

### KOSTATION Adaptation

- Keep the summary card on resident detail.
- Use canonical invoice/payment/allocation states.
- Tabs are Unpaid Invoices, Paid/Allocated, Awaiting Confirmation, and
  Additional Payments.
- Each count and amount derives from authoritative ledgers.
- Payment and invoice detail deep-link or open a bounded detail dialog.

### Rejected

- UI-only totals.
- One ambiguous “total semua tagihan” that mixes rent, deposit, and expenses.
- Deposit counted as revenue.

## 10. Manual Rent Payment References

### Reference Behavior

- Choose payment type/date.
- Select multiple monthly bills.
- Add notes.
- Upload proof.
- Create one payment code and inspect allocations.

### KOSTATION Adaptation

- Payment method is transfer or audited cash.
- One logical payment can allocate to selected invoices.
- Transfer proof is required; cash has a generated/recorded receipt.
- Payment code, date, total, evidence, notes, allocations, invoice links, and
  receipt are visible.
- A proof starts or supports confirmation; it does not automatically mean paid.
- Corrections are reversal/supersession.

### Rejected

- Hard “Hapus Pembayaran.”
- Payment without an invoice for ordinary rent.
- Treating uploaded proof as final settlement.
- Generic type labels that cannot distinguish method from purpose.

## 11. Additional Payment References

### Reference Behavior

- Separate form with method, date, nominal, evidence, and notes.
- List and delete action.

### KOSTATION Adaptation

- Explicit categories such as access replacement, damage charge, parking,
  service, or other approved charge.
- Resident, property, optional room/lease, evidence, and audit link.
- Payment method remains separate from purpose.
- Correction/reversal replaces delete.

### Rejected

- Using “other payment” to bypass rent invoicing.
- Unclassified money entry.
- Historical hard delete.

## 12. Invoice and Receipt References

### Reference Behavior

- PDF invoice preview/download.
- Paid marker.
- Period and payment notes.

### KOSTATION Adaptation

- Invoice represents an amount due.
- Receipt represents confirmed payment.
- Both use KOSTATION identity, canonical codes, periods, resident/room summary,
  money breakdown, and secure access.
- Reminder may include expiring invoice links.
- A paid/reversed state is explicit and derived, not a cosmetic watermark only.

### Rejected

- Public permanent file URL.
- Payment proof embedded in a broadly accessible report.
- Invoice and receipt treated as the same document.

## 13. Reminder Template Reference

### Reference Behavior

- Editable message containing variables such as name, room, period, total, lease
  dates, and due date.
- Send Email, Send WhatsApp, or both.

### KOSTATION Adaptation

- Versioned templates with protected variables.
- Admin may edit prose but cannot remove or forge required variable semantics.
- Preview resolves selected invoice periods, total, due date, lease dates,
  contact, and secure invoice links.
- WhatsApp MVP opens `wa.me`.
- Email and combined send are disabled until a provider is configured.
- Reminder attempt records honest channel/outcome.

### Rejected

- Claiming automated send/delivered/read from a browser redirect.
- Saving secrets or raw PII in template configuration.
- Unresolved variables in a sent message.

## 14. Current-Month and Resident-Specific Reminder References

### Reference Behavior

- Current-month billing row has “View Details” and “Send Reminder.”
- Resident detail allows checkbox selection of invoice months.

### KOSTATION Adaptation

- Current-month entry is a prefilled composer bound to the canonical current
  invoice work.
- Resident-detail entry is flexible and includes only checked unpaid invoices.
- Preview and total update synchronously with selection.
- Both use the same template/render/attempt authority.

### Rejected

- Two unrelated implementations or message histories.
- Selecting paid/reversed/other-resident invoices.

## 15. H-30 and Reminder History References

### Reference Behavior

- Sidebar Reminder Sewa with H-30 and history.
- Header reminder icon and count.
- Expandable rows and reminder detail/delete.

### KOSTATION Adaptation

- Keep H-30 and History as clear Admin destinations.
- Add H-60 renewal intent and H-14 checkout policy events to the same reminder
  authority.
- Header reminder count is derived from current eligibility and clears when the
  underlying work resolves.
- History expands to message summary and opens full detail.
- Archive replaces delete.

### Rejected

- Badge count stored independently and becoming stale.
- Hard-delete reminder evidence.
- Mixing reminders with internal unread notifications.

## 16. Header Notification References

### Reference Behavior

- Bell popover with recent items and “view all.”
- Unread indicator and count.

### KOSTATION Adaptation

- Internal event notifications for billing, lease, Booking Lead, room,
  complaint, vehicle, reminder, and data exceptions.
- Read state and deep link.
- Account/property/building scope.
- Separate reminder indicator when needed.

### Rejected

- Notification list as a copy of reminder history.
- Cross-scope event visibility.
- Permanent count after resolution/read.

## 17. Payment Management Page Reference

### Reference Behavior

- Filter by start date, end date, and payment status.
- Table combining rent and other payments.

### KOSTATION Adaptation

- Date range, purpose, method, confirmation status, property/building, resident,
  and search filters.
- Clear columns for payment code, resident, purpose, method, date, amount,
  allocation/confirmation, proof, and action.
- Expand/detail shows allocations and audit-safe correction status.

### Rejected

- Ambiguous `tipe pembayaran` and `jenis pembayaran` without canonical
  definitions.
- Table-page totals used as reports.

## 18. Expense References

### Reference Behavior

- Date, amount, proof/photo, notes, action.
- Add form and image upload.

### KOSTATION Adaptation

- Add category, property, optional building, vendor, method, optional work
  order, approval status, and correction state.
- Preview evidence before save.
- Exact Rp500,000 approval boundary: manager approval below it; amounts at or
  above it remain pending until the higher approver policy in
  `OWNER_CONFIRMATION_REQUIRED-005` is decided.
- Private evidence and report-safe derivative.

### Rejected

- Branch selector when KOSTATION scope is property/building.
- Hard delete after approval/reporting.
- Expense entered as a negative payment.

## 19. Report References

### Reference Behavior

- Lease, Payment, Expense, Finance submenus.
- Date filters, display/reset, Excel/PDF actions.
- Expandable tables.
- PDF previews.

### KOSTATION Adaptation

- Keep four report domains with canonical names.
- Filters live in URL and execute server-side.
- Preview, Excel, and PDF share one filter and full dataset.
- Lease report includes term/status.
- Payment report includes invoice/payment/allocation purpose.
- Expense report includes category and approval/correction.
- Finance report distinguishes revenue, additional income, expense, receivable,
  deposit liability, operational cash flow, occupancy, and arrears. It does not
  claim profit/loss without a separate accrual-accounting authority.

### Rejected

- Generic “Pemasukan” label for a finance statement.
- Security deposit counted as income.
- Exporting only the current UI page.
- Copying external report branding or branch assumptions.

## 20. Property Owner Reference

No supplied screenshot is authority for investor behavior. The product-owner
description is adopted as:

- one Owner may own multiple whole Rumah Kost buildings and multiple individual
  Apart Kost rooms;
- an unassigned asset is operationally `Kostation-owned`;
- the Owner receives a distinct `property_owner` login;
- access is read-only and limited by asset and effective ownership period;
- dashboards, operational records, reports, and financial summaries are reduced
  to that scope;
- sensitive identity and credentials are excluded.

Property-wide legacy ownership assignment must be migrated to explicit
mixed-asset ownership history without automatic property-wide backfill. The
standard economic reference is Rp1.800.000 earned rent per occupied room-month,
split into Rp1.500.000 Owner entitlement and Rp300.000 Kostation management fee;
security deposit and vacancy are excluded.

## 21. Terminology Replacement Table

| External or ambiguous term | KOSTATION term                                                   |
| -------------------------- | ---------------------------------------------------------------- |
| Cabang                     | Property or Building, according to scope                         |
| Penyewa/Tenant             | Resident when referring to person                                |
| Penyewaan                  | Lease when referring to contract                                 |
| Konversi                   | Lease Activation                                                 |
| Survey                     | Removed unless a future explicit appointment feature is approved |
| DP/Deposit combined        | DP and Security Deposit, separate                                |
| Tipe pembayaran            | Payment Method                                                   |
| Jenis pembayaran           | Payment Purpose                                                  |
| Pembayaran lainnya         | Additional Payment                                               |
| Hapus pembayaran           | Reverse/Correct Payment                                          |
| Pengeluaran                | Operational Expense                                              |
| Pemasukan                  | Revenue/Additional Income/Cash Inflow, named explicitly          |
| Reminder                   | Outbound Reminder                                                |
| Notifikasi                 | Internal Notification                                            |
| Owner                      | Global operator `owner`                                          |
| Pemilik properti/investor  | `property_owner`                                                 |

## 22. Future Screenshot Use

The implementation team does not need the same screenshots again. A new
screenshot is useful only when:

- it demonstrates a new, unrecorded behavior;
- exact visual composition is intentionally required;
- it helps reproduce a runtime defect;
- it resolves a genuinely ambiguous interaction.

Otherwise this documentation package is the implementation authority.
