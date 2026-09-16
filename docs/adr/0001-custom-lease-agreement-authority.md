---
status: accepted
---

# Custom lease agreements use one immutable commercial snapshot

KOSTATION will support 1–120 month agreements, including negotiated monthly
rates, by storing one immutable contract snapshot containing duration, reference
tariff, agreed tariff, contract value, pricing source, reason, actor, and time.
All payment allocation, invoices, receipts, reports, Owner progress, and earned
income derive from that snapshot. The standard duration tiers remain the default;
the negotiated path is explicit because silently editing a room price would
rewrite history and make Admin, resident, and Property Owner totals disagree.

## Consequences

- A 1–2 month term is only available through an explicit special agreement.
- A 3–120 month term may use the standard tier or a negotiated rate.
- The existing lease monthly-price snapshot stores the agreed rate; a separate
  reference-rate snapshot preserves the standard comparison without changing
  category pricing.
- Financial activation requires verified rent credit covering at least one
  agreed month, capped by the whole contract. The 25% value remains a suggested
  prefill rather than a blocking minimum.
- New 1–120-month checkpoint schedules use a new settlement-policy version;
  existing `lease_settlement_v2` snapshots and checkpoints remain immutable.
- A renewal or formal amendment creates a new snapshot; an old lease is never
  rewritten in place.
- Admin may see the negotiation reason; Property Owner and Penghuni receive the
  approved commercial facts, not private negotiation notes.
