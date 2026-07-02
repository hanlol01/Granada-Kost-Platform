# Internal Demo Checklist

Tanggal QA: 2026-07-02
Role: QA Engineer
Scope: QA-01 Final Regression

## 1. Test Environment

| Item | Value |
| --- | --- |
| Project | Granada Kost Platform / Kostation |
| Admin app | `http://localhost:8080` |
| Penghuni app | `http://localhost:8081` |
| Backend API | `http://localhost:3000/api/v1` |
| Backend health | PASS: database up, Redis up |
| Browser automation | Local Google Chrome via Chrome DevTools Protocol |
| Artifact directory | `artifacts/internal-demo/` |
| Smoke result JSON | `artifacts/internal-demo/smoke-result.json` |
| Automation driver | `artifacts/internal-demo/smoke-test.cjs` |
| Final smoke finished at | `2026-07-02T01:21:10.510Z` |

Notes:
- Dev servers were already reachable on `3000`, `8080`, and `8081`.
- Final regression used a fresh Chrome profile and cleared cookies between Admin and Penghuni sessions.

## 2. Test Accounts Used

| App | Login | Password |
| --- | --- | --- |
| Admin | `dev.admin@kostation.test` | `********` |
| Penghuni | `dev.resident.alpha@kostation.test` | `********` |

## 3. Admin Checklist

| Check | Result | Evidence |
| --- | --- | --- |
| Open Admin `/login` | PASS | `artifacts/internal-demo/admin-login.png` |
| Login as Admin | PASS | Dashboard reached after login |
| Dashboard renders | PASS | `artifacts/internal-demo/admin-dashboard.png` |
| Rooms renders | PASS | `artifacts/internal-demo/admin-rooms.png` |
| Residents renders | PASS | `artifacts/internal-demo/admin-tenants.png` |
| Payments renders | PASS | `artifacts/internal-demo/admin-payments.png` |
| Complaints renders | PASS | `artifacts/internal-demo/admin-complaints.png` |
| Vehicles renders | PASS | `artifacts/internal-demo/admin-vehicles.png` |
| Parking renders | PASS | `artifacts/internal-demo/admin-parking.png` |
| Reports renders | PASS | `artifacts/internal-demo/admin-reports.png` |
| No React warning | PASS | No `Cannot update a component` warning in final smoke result |
| No validation error | PASS | No `VALIDATION_ERROR` / status `400` in final smoke result |
| No fatal console error | PASS | Only expected unauthenticated bootstrap/favicon observations remained |
| No infinite loading | PASS | No persistent loading state in final smoke result |
| No broken navigation | PASS | All scoped routes reached expected content |
| Logout works | PASS | Returned to `http://localhost:8080/login` |

## 4. Penghuni Checklist

| Check | Result | Evidence |
| --- | --- | --- |
| Open Penghuni `/login` | PASS | `artifacts/internal-demo/penghuni-login.png` |
| Login as Penghuni | PASS | Home reached as `Dev Resident Alpha` |
| Home renders | PASS | `artifacts/internal-demo/penghuni-home.png` |
| Billing renders | PASS | `artifacts/internal-demo/penghuni-billing.png` |
| Complaints renders | PASS | `artifacts/internal-demo/penghuni-complaints.png` |
| Notifications renders | PASS | `artifacts/internal-demo/penghuni-notifications.png` |
| Profile renders | PASS | `artifacts/internal-demo/penghuni-profile.png` |
| No React warning | PASS | No `Cannot update a component` warning in final smoke result |
| No validation error | PASS | No `VALIDATION_ERROR` / status `400` in final smoke result |
| No fatal console error | PASS | Only expected unauthenticated bootstrap/logout observations remained |
| No infinite loading | PASS | No persistent loading state in final smoke result |
| No broken navigation | PASS | All scoped routes reached expected content |
| Logout works | PASS | Returned to `http://localhost:8081/login` |

## 5. Console/Network Observations

Final regression did not reproduce the previously blocking findings:
- `QA-01-BUG-001`: no React `Cannot update a component ... LoginPage` warning.
- `QA-01-BUG-002`: no `400 VALIDATION_ERROR` from vehicle/parking/report flows.

Expected low-risk observations:
- Initial unauthenticated silent refresh can produce `401 INVALID_REFRESH_TOKEN` after browser cookies are cleared.
- After Penghuni logout, in-flight profile/session requests can produce `401 UNAUTHENTICATED` / `401 INVALID_REFRESH_TOKEN`; logout still returns to `/login`.
- `favicon.ico` can return `404` in local dev. This is not a functional smoke failure.

## 6. Known Placeholders

Accepted placeholders, not counted as failures:
- Smart Lock live not tested.
- CCTV not tested.
- Booking not tested.
- Chat real not tested.
- Audit Viewer placeholder.
- Export disabled.
- Payment proof upload disabled.
- Complaint create resident disabled.
- Admin Notifications page may still be placeholder if not in current scope.
- Admin Settings may still be placeholder if not in current scope.
- Penghuni Info announcement endpoint placeholder is visible and accepted for current scope.

## 7. Bug Status

| ID | Status | Verification |
| --- | --- | --- |
| QA-01-BUG-001 | CLOSED | Final regression confirmed login works and React warning no longer appears |
| QA-01-BUG-002 | CLOSED | Final regression confirmed Vehicles, Parking, and Reports do not emit `400 VALIDATION_ERROR` |

See also: `docs/11-qa/BUG_TRIAGE_001.md`.

## 8. Screenshots Path List

- `artifacts/internal-demo/admin-login.png`
- `artifacts/internal-demo/admin-dashboard.png`
- `artifacts/internal-demo/admin-rooms.png`
- `artifacts/internal-demo/admin-tenants.png`
- `artifacts/internal-demo/admin-payments.png`
- `artifacts/internal-demo/admin-complaints.png`
- `artifacts/internal-demo/admin-vehicles.png`
- `artifacts/internal-demo/admin-parking.png`
- `artifacts/internal-demo/admin-reports.png`
- `artifacts/internal-demo/penghuni-login.png`
- `artifacts/internal-demo/penghuni-home.png`
- `artifacts/internal-demo/penghuni-billing.png`
- `artifacts/internal-demo/penghuni-complaints.png`
- `artifacts/internal-demo/penghuni-notifications.png`
- `artifacts/internal-demo/penghuni-info.png`
- `artifacts/internal-demo/penghuni-profile.png`

## 9. Human UX Review

Manual notes:


## 10. Validation

| Command | Result | Notes |
| --- | --- | --- |
| `npm run lint:admin` | PASS | 0 errors, 15 existing warnings |
| `npm run lint:penghuni` | PASS | 0 errors, 9 existing warnings |
| `npm --workspace @granada-kost/admin run typecheck` | PASS | `tsc --noEmit` completed |
| `npm --workspace @granada-kost/penghuni run typecheck` | PASS | `tsc --noEmit` completed |
| `npm run build:admin` | PASS | Vite client and SSR build completed |
| `npm run build:penghuni` | PASS | Vite client and SSR build completed |

## 11. Final Verdict

Internal Demo Ready

Reason:
- Full Admin and Penghuni Internal Demo smoke test passed.
- `QA-01-BUG-001` and `QA-01-BUG-002` are closed.
- Lint, typecheck, and build passed for Admin and Penghuni.
