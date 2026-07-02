# Bug Triage 001

Tanggal: 2026-07-02
Role: QA Engineer
Source QA: QA-01 Final Regression
Source document: `docs/00-project/INTERNAL_DEMO_CHECKLIST.md`

## 1. Release Decision

Verdict: Internal Demo Ready

The final regression confirms both QA-01 issues are closed. Admin and Penghuni smoke tests pass, logout works, and validation commands pass.

## 2. Triage Summary

| ID | Severity | Priority | Area | Internal Demo Blocker | Status |
| --- | --- | --- | --- | --- | --- |
| QA-01-BUG-001 | Medium | High | Admin/Penghuni Login | No | CLOSED |
| QA-01-BUG-002 | Medium | High | Admin Parking / Vehicle API integration | No | CLOSED |

## 3. Bug Details

## QA-01-BUG-001

Severity: Medium

Priority: High

Area: Admin/Penghuni Login

Root cause: LoginPage had two success redirect paths. After `await login(...)`, the submit handler called `navigate(...)`, while the authenticated-status effect also redirected. Because `login()` updates auth context, submit-handler navigation could overlap with the auth-driven render transition and trigger the React warning.

Fix summary:
- Admin LoginPage redirect now happens only via the authenticated-status effect.
- Penghuni LoginPage redirect now happens only via the authenticated-status effect.

Verification:
- Admin login reached Dashboard.
- Penghuni login reached Home.
- React warning `Cannot update a component while rendering a different component ... LoginPage` did not appear in final regression.

Status: CLOSED.

## QA-01-BUG-002

Severity: Medium

Priority: High

Area: Admin Parking / Vehicle API integration

Root cause: The Admin parking slot assignment dialog called `GET /vehicles` with `status=active&limit=200`. Backend vehicle pagination validates `limit` with `@Max(100)`, so the global validation pipe returned `400 VALIDATION_ERROR`.

Fix summary:
- `AssignSlotDialog.tsx` now fetches active vehicles with `limit: 100`.

Verification:
- Vehicles page opened successfully.
- Parking page opened successfully.
- Reports page opened successfully.
- No `400 VALIDATION_ERROR` appeared in final regression.

Status: CLOSED.

## 4. Final Validation

| Command | Result |
| --- | --- |
| `npm run lint:admin` | PASS |
| `npm run lint:penghuni` | PASS |
| `npm --workspace @granada-kost/admin run typecheck` | PASS |
| `npm --workspace @granada-kost/penghuni run typecheck` | PASS |
| `npm run build:admin` | PASS |
| `npm run build:penghuni` | PASS |
