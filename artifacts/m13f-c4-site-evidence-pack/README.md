# M13F-C4.1 Smart Lock Site Evidence Pack

Purpose: canonical sanitized evidence for M13F-C3 dry-run behavior with Smart Lock live commands disabled.

Environment mode used:
- SMART_LOCK_PROVIDER=tuya
- SMART_LOCK_LIVE_ENABLED=false
- Tuya credential mode: placeholder/fake local QA values
- Backend API base URL for this run: http://127.0.0.1:3013/api/v1

What was tested:
- API health.
- Admin/resident/property-owner authentication boundaries.
- Command RBAC denial for unauthenticated, resident, and property-owner actors.
- Request validation for confirmation, reason, idempotency key, and unsupported command.
- Guarded remote_unlock dry-run returning LIVE_COMMAND_DISABLED with accepted=false.
- Idempotency replay with idempotency_replayed=true.
- Rate limit returning RATE_LIMITED.
- Resident self-unlock remains denied.
- Read-only diagnostic/sync compatibility routes fail safely in placeholder environment.
- DB audit/access-log and Redis idempotency/rate-limit observations.
- Leakage checks against responses, DB observations, Redis values, and generated artifacts.

What was not tested:
- No live physical unlock.
- No live lock.
- No temporary PIN.
- No frontend UI.
- No real site Tuya credentials.
- No approved real site device mapping or battery/online readiness.

PASS/FAIL summary: PASS

Limitations:
- This closes the local C3-class dry-run evidence gap only partially for B-23.
- A site-env rerun with approved credentials, named approvals, and the selected non-occupied mapped device is still required before live execution GO.

Explicit safety statement: no live physical unlock was executed.
