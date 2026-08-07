# KMO Ubiquitous Language

Status: **APPROVED GLOSSARY**

This compact glossary captures the latest terms that W07 and later work packages
must use. It intentionally contains business language only; implementation and
evidence remain in the architecture, lifecycle, and traceability documents.

| Term                         | Canonical meaning                                                                                                                                                                     | Not the same as                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Booking Lead                 | A prospective renter's recorded interest.                                                                                                                                             | Hold, lease, occupancy, resident account                 |
| Hold                         | A temporary room reservation.                                                                                                                                                         | Tenancy or an active room placement                      |
| Booking Fee                  | Optional advance-rent credit. It is Rp0 or at least Rp1.000.000 and reduces remaining contract rent.                                                                                  | Security deposit or separate rental revenue              |
| DP / Uang Muka Sewa          | Advance-rent credit. The system pre-fills a 25% contract-value recommendation, but an authorized admin may record a lower amount by agreement.                                        | Security deposit                                         |
| Security Deposit             | Optional refundable liability recorded for a lease. Rp0 is valid; any nonzero amount is reconciled at checkout through refund or documented deduction.                                | Booking Fee, DP, or rent revenue                         |
| Lease / Penyewaan            | A contractual right to occupy one room for an agreed term and commercial snapshot.                                                                                                    | The previous idea of a separate `/penyewaan` master page |
| Awaiting-activation lease    | A committed lease that reserves its exact room until an authorized check-in or activation.                                                                                            | An active occupancy                                      |
| Occupancy / Hunian           | The actual active resident-to-room placement.                                                                                                                                         | Pending onboarding or an awaiting-activation lease       |
| Initial rent credit          | The verified Booking Fee plus verified DP that reduces contract rent. The 25% figure is a recommendation, not an eligibility gate.                                                    | Security-deposit funding                                 |
| Contract settlement deadline | One official deadline for the remaining contract rent, two months after activation. A partial payment reduces the balance but never creates a monthly invoice or moves this deadline. | A monthly rent invoice or a new lease term               |
| Grace window                 | The seven calendar days after the official deadline during which a partial payment is still allowed. It is not a second extension or a replacement due date.                          | A payment-term extension                                 |
| Contract start date          | A valid historical, current, or future contractual date.                                                                                                                              | The time when occupancy automatically becomes active     |

Normal direct onboarding accepts a term from 3 through 120 months. A one- or
two-month term requires a future, separately approved exception policy.
