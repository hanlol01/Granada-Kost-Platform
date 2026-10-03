# Report attention cards

Status: implemented on the five Admin report workspaces.

## Scope and behavior

- Show one collapsible **Pemberitahuan** card on each primary report page: Leases, Payments, Expenses, Finance, and Owner Realization. The individual Owner realization detail remains contextual to its one record.
- Counts follow the selected property and report period; Owner counts also follow the selected Owner profile status. Search, row status, and pagination filters do not change the attention counts.
- Action items and period information appear in separate groups within the same card. Selecting an item opens the related report filter or operational billing page.
- The card is a live, read-only projection. It does not create a persistent notification or mark any underlying workflow as complete when collapsed.
- A report query failure displays a retry action without blocking the report table. Zero-count categories are hidden.

## Categories

| Report            | Action categories                                                                                                                                                                                | Period information                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Leases            | Check-out awaiting room inspection; check-out awaiting final settlement; pending final refund; final amount due                                                                                  | Contracts whose end date falls in the selected range                                  |
| Payments          | Payments awaiting confirmation                                                                                                                                                                   | Reversed payments                                                                     |
| Expenses          | Expenses awaiting approval; approved expenses awaiting payment                                                                                                                                   | Draft expenses                                                                        |
| Finance           | Currently unpaid invoices due no later than the selected end date                                                                                                                                | Negative net operational cash for the selected range                                  |
| Owner Realization | Eligible contracts ready to be prepared for a closed period; draft; awaiting review; approved; submitted to Finance; awaiting transfer; partially transferred; fully transferred but unpublished | Eligible contracts ready to be prepared during an open period; published realizations |

## Owner Realization counting rules

- “Ready to prepare” counts eligible, fully paid contracts that are not locked into any realization, grouped by Owner. Owners without eligible contracts do not count.
- An Owner with a completed batch and newly eligible contracts in the same month counts again as ready to prepare. A batch that is still in progress stays in its current workflow category until its status allows another preparation.
- The card shows both the number of realization batches created for the selected month and the distinct number of Owners represented by those batches. Workflow categories count batches, not Owners.
- A month earlier than the current Jakarta month is closed; ready contracts then require attention. Ready contracts during the current or a future month are informational.
- Transfer status and publication status remain distinct. A fully transferred batch is not called published until the publish action succeeds.
- The `not_prepared` filter returns only Owners who have eligible contracts and no active realization batch, matching the ready category.

## Data authority

General report categories use the existing report preview authority with a property-and-period-only query. Owner categories use the Owner realization list authority before pagination. No counts derive from the rows currently visible on screen.
