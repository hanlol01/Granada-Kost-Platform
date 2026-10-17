# Owner-Sponsored Negotiated Management Fee — Decision Record

> **Status:** Implemented and verified locally — pending a separately authorized commit, deployment, and production migration.
>
> **Recorded:** 2026-10-17 (Asia/Jakarta)
>
> **Scope:** New `owner_sponsored` leases whose management-fee mode is
> `charged`. This decision does not authorize a production migration, data
> backfill, deployment, or service restart.

## 1. Problem

`Hunian Tanggungan Owner` correctly records a rent-free occupancy, but the
current charged-management-fee projection comes from the effective property
management-fee policy. Operationally, some Owner-sponsored occupancies have a
separately negotiated management fee for one specific resident and lease.

Using the current property policy for those agreements causes two problems:

1. Admin cannot record the negotiated amount agreed for that resident.
2. A later property-policy change can alter the projected fee for an existing
   sponsored occupancy instead of preserving the agreement made at onboarding.

The solution must support the individual agreement without changing normal paid
lease economics, Owner Entitlement, historical leases, or verified financial
records.

## 2. Decision summary

For a new **Hunian Tanggungan Owner** lease where Admin chooses **Dengan biaya
pengelolaan**, Admin will enter a required negotiated monthly management-fee
amount and a required agreement note. The amount is a contract-level snapshot,
not a room or property-policy value.

The negotiated fee applies only to that sponsored lease. It remains separate
from rent and Owner Realization. Existing Owner-sponsored leases remain
unchanged.

## 3. Terminology

| Term                                        | Meaning                                                                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Standard Property Management-Fee Policy** | The effective-dated fee policy used by normal paid leases to calculate Kostation Management Fee and Owner Entitlement.                  |
| **Negotiated Sponsored Monthly Fee**        | The agreed monthly management-fee amount for one newly created charged Owner-sponsored lease. It is a lease snapshot.                   |
| **Negotiated Sponsored Contract Fee**       | `Negotiated Sponsored Monthly Fee × contractual duration in months`. It is the full management-fee obligation for that sponsored lease. |
| **Agreement Note**                          | The required Admin-only explanation of the negotiated amount. It is distinct from the reason for Owner-sponsored occupancy.             |
| **Active Management-Fee Payment**           | A sponsored management-fee payment that is pending confirmation or verified and has not been reversed.                                  |

## 4. Scope and non-goals

### In scope

- New Owner-sponsored leases with `management_fee_mode = charged`.
- A negotiated monthly fee, agreement note, snapshot, payment progress, and
  permitted correction rules for those leases.
- Moving normal paid-lease management-fee configuration out of **Edit Tipe
  Kost** into a dedicated **Kebijakan Keuangan Properti** surface.

### Explicitly out of scope

- Repricing, converting, or backfilling any existing lease.
- Changing normal paid-rent tariffs, historical Owner Entitlement, Owner
  Realization, or Property Owner transfers.
- Treating Owner-sponsored management-fee payments as rent, booking fee, DP,
  security deposit, or Owner income.
- Creating due dates, overdue states, late fees, or payment reminders for this
  fee.
- Enabling a separate sponsor-aware renewal or room-transfer workflow. Existing
  lifecycle restrictions remain until their own approved stage is implemented.

## 5. Onboarding decision table

| Commercial mode   | Fee mode  | Required management-fee input                                                     | Financial result                                                                      |
| ----------------- | --------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `rent`            | N/A       | No negotiated sponsored-fee field                                                 | Existing normal paid-lease rules and property policy continue.                        |
| `owner_sponsored` | `waived`  | No payer, amount, or agreement note                                               | Rent and sponsored fee are Rp0. No payment action is available.                       |
| `owner_sponsored` | `charged` | Payer, negotiated monthly amount, agreement note, and existing sponsorship reason | Rent is Rp0; the negotiated sponsored contract fee is a separate flexible obligation. |

For `charged`, `other` remains a permitted payer and continues to require the
existing payer name. The room must still have an active, compatible Ownership
Assignment for the selected Property Owner.

## 6. Admin experience

### 6.1 Lease creation

When Admin selects **Hunian Tanggungan Owner** and **Dengan biaya
pengelolaan**, the form must show:

- **Biaya pengelolaan disepakati per bulan** as a required Rupiah input;
- an `Rp` prefix inside the field and Indonesian thousands separators (`.`) as
  the value is entered;
- a clear placeholder example, such as `300.000`;
- a required **Catatan kesepakatan biaya pengelolaan** field, separate from
  **Alasan hunian tanggungan Owner**;
- a non-blocking warning when the entered monthly fee exceeds the selected
  room's monthly rent reference; and
- a summary that shows the monthly snapshot, contractual duration, and
  projected total.

The initial value must be empty. Admin must actively record the negotiated
amount; the Standard Property Management-Fee Policy is not a prefill for this
specific agreement.

### 6.2 Property policy administration

The management-fee fields must be removed from **Edit Tipe Kost**. They model
commercial policy, not a physical room-type attribute.

The existing normal paid-lease policy must instead be administered in a
dedicated **Kebijakan Keuangan Properti** surface. Changes to that policy remain
effective-dated and prospective. They must not rewrite historical Owner
Entitlement, payment, report, realization, or lease-snapshot facts.

## 7. Authoritative contract model and calculation

Server-side calculation is authoritative. The Admin client submits a proposal;
the API validates, persists, and returns the resulting commercial snapshot.

For a charged sponsored lease:

```text
negotiated_contract_fee = negotiated_monthly_fee × contractual_duration_months
remaining_fee = negotiated_contract_fee − verified_unreversed_fee_payments
```

Pending payments are shown separately from verified payments. They do not reduce
the verified balance until confirmation, but they are still active financial
records for correction-lock purposes.

The implementation must persist enough immutable lease-level authority to
recover the current state without re-reading a later property policy:

- `negotiated_monthly_management_fee_amount`;
- `negotiated_management_fee_contract_amount`;
- `management_fee_agreement_note`;
- the existing fee mode, payer, payer name when applicable, Owner snapshot,
  sponsorship reason, actor, and timestamps.

Exact column/table names are implementation details. The persistence change must
be additive and must preserve existing data.

## 8. Financial and reporting boundaries

- Room rent, booking fee, DP, security deposit, rent invoice, and Owner rent
  entitlement remain Rp0 for Owner-sponsored occupancy.
- The negotiated sponsored fee is a separate Kostation service receivable and
  payment purpose.
- The fee never increases, reduces, or otherwise changes **Hak Owner** or an
  Owner Realization amount.
- Admin detail, billing, payment recording, receipt, and relevant Admin reports
  must render the same server-projected monthly, contractual, pending, verified,
  and remaining values.
- The Property Owner portal may show approved commercial facts and current fee
  progress only for that Owner's assigned asset. The private agreement note and
  internal sponsorship rationale remain Admin-only.
- Current-state documents and exports must regenerate from the same authoritative
  query as their onscreen preview. Historical per-payment receipts remain
  immutable evidence of their own payment event.

## 9. Corrections, duration changes, and lifecycle rules

### 9.1 Direct correction gate

Admin may change the negotiated monthly amount or the agreement note only when
there is no Active Management-Fee Payment. A pending-confirmation payment locks
the agreement just as a verified payment does.

The correction command requires a reason and records the before/after monetary
values, actor, and timestamp. It must not silently rewrite a payment, receipt,
or export that has already recorded a financial event.

### 9.2 After a payment begins

Once a pending or verified management-fee payment exists, direct amount changes
are rejected. A future, separately authorized financial-correction workflow
must create an auditable adjustment or reversal; it must not mutate the original
contract or payment in place.

### 9.3 Duration changes

Where an approved Owner-sponsored lease-duration correction is available and no
Active Management-Fee Payment exists, it uses the same negotiated monthly
snapshot:

```text
revised_contract_fee = negotiated_monthly_fee × revised_duration_months
```

If the duration is shortened after a payment exists, the system must not
automatically alter received money. The separate financial-correction flow is
required for any resulting credit, refund, or adjustment.

## 10. Compatibility and rollout

- Existing `owner_sponsored` terms retain their current effective-policy
  projection and all existing financial records unchanged.
- Only leases created after the feature is released use the negotiated sponsored
  fee snapshot.
- The database migration must be additive, replay-safe, and recorded through
  the official migration manifest and ledger.
- No historical data backfill is permitted without a separate approved and
  auditable plan.
- Deployment remains a separate authorization with normal backup, migration,
  build, service-restart, and smoke-test gates.

## 11. Acceptance criteria

1. A charged Owner-sponsored lease cannot be committed without a positive
   negotiated monthly amount, payer information, sponsorship reason, and
   agreement note.
2. A waived Owner-sponsored lease has no negotiated fee, payer, payment action,
   or fee balance.
3. The amount entered by Admin is stored as a contract snapshot and is not
   changed by later Standard Property Management-Fee Policy edits.
4. A fee above the room rent reference produces a visible warning but remains
   committable when all other validation passes.
5. A new lease shows `monthly × duration = contractual fee` consistently in
   API output, Admin detail, payments, receipts, reports, and eligible Owner
   portal views.
6. Owner Entitlement and Owner Realization totals do not change because of a
   negotiated sponsored fee.
7. Any pending-confirmation or verified sponsored-fee payment blocks direct
   negotiated-fee edits.
8. A permitted pre-payment correction and a permitted duration correction leave
   an auditable before/after record.
9. Existing leases and their current reports remain byte-for-byte and
   financially unchanged by the migration.
10. Standard paid-lease management-fee policy is editable only in **Kebijakan
    Keuangan Properti** and remains prospective.

## 12. Required implementation evidence

- Focused API tests for all rows in the onboarding decision table, calculation
  boundaries, authorization, correction lock, and property scope.
- Migration first-apply, replay, sentinel, and preservation tests on a
  disposable PostgreSQL target.
- Admin tests for Rupiah formatting, empty-required amount, high-amount warning,
  and paid/pending correction lock.
- Document/report/portal parity tests proving that they consume one server
  projection and do not expose the private agreement note to the Property Owner.
- API and Admin production builds plus focused type/lint checks.
- A staged release preflight before any production migration or deployment.

## 13. References

- [KMO Context](CONTEXT.md)
- [Owner-sponsored occupancy handoff](handoff/04_OWNER_SPONSORED_OCCUPANCY_HANDOFF.md)
- [Custom lease agreement authority](../adr/0001-custom-lease-agreement-authority.md)
- [Billing, reminder, notification, and reporting contract](BILLING_REMINDER_NOTIFICATION_REPORTING.md)
- [Data authority matrix](DATA_AUTHORITY_MATRIX.md)
