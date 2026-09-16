---
status: accepted
---

# Physical checkout and financial settlement are separate authorities

Check-out is a staged lifecycle: notice, schedule, handover, inspection, and
final settlement. Physical handover ends occupancy and makes the room eligible
for inspection, but it does not imply that every financial question is closed.
The final settlement preserves earned rent, verified payments, short-notice
compensation, deposit liability, deductions, amount due, and refund as separate
values. This separation supports sudden departures without losing auditability or
making a room appear vacant before inspection.

## Consequences

- “Check-out mendadak” is an early termination with today's effective date and a
  recorded notice exception, not a third database exit type.
- A resident may retain limited access to final bills, evidence, and refund
  status while the financial status is still open.
- Refunds are pending until an Admin records the transfer and its evidence.
- An amount still due is closed through the authoritative invoice/payment
  allocation flow, not by editing the checkout snapshot.
- Approved short-notice compensation is attributed to the Property Owner and
  does not create another monthly management fee.
- Security Deposit offsets approved rent arrears first, then documented damage;
  every component remains visible even when the final payable direction is netted.
- Physical handover moves the room to inspection; only the room-inspection
  authority may resolve it to vacant or maintenance.
- Every open checkout is unique per lease and every command is idempotent.
