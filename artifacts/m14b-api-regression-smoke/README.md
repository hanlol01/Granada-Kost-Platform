# M14B API Regression Smoke Evidence

## Purpose

Sanitized QA evidence for M14B API regression and security smoke across M12-M13 backend surfaces.

## Environment

- Timestamp: 2026-07-04T04:57:55.980Z
- Commit: 5f1b96b
- Branch: master
- API base URL: http://127.0.0.1:3016/api/v1
- Smart Lock mode: provider=simulated, live_enabled=false

## What Was Tested

- Auth/session, invalid login, unauthenticated protected routes
- RBAC and resident/property owner denial paths
- Resident self-scope and cross-resident file/attach denial
- File upload, metadata, content, unsupported/oversized/deleted file behavior
- Manual payment proof submission with file_ids
- Complaint create without and with complaint_attachment file_ids
- Admin proof/complaint file metadata endpoints
- Smart Lock read-only diagnostics/sync and command guard fail-closed behavior
- Audit/security sanity and leakage checks

## What Was Not Tested

- Browser QA
- Frontend UI
- Live Smart Lock command execution
- SMART_LOCK_LIVE_ENABLED=true
- Cross-property boundary with a second property, because only one property was available in the local seed data
- Admin verify/reject mutation for payment proof, to keep QA proof pending_review

## PASS/FAIL Summary

- Auth: PASS
- RBAC: PASS
- Property scope: PASS
- File API: PASS
- Payment proof: PASS
- Complaint attachment: PASS
- Smart Lock read-only: PASS
- Smart Lock command guard: PASS
- Audit/security: PASS
- Leakage: PASS
- Verdict: PASS

## Limitations

- Cross-property denial was not fully testable because only one local seed property was exposed to admin.
