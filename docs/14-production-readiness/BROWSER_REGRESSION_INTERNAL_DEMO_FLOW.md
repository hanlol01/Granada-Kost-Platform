# M14C Browser Regression / Internal Demo Flow

Status: PASS

Executed at: 2026-07-04T06:08:12.424Z

## Environment

- Backend API: `http://127.0.0.1:3018/api/v1`
- Admin frontend: `http://127.0.0.1:55333`
- Penghuni frontend: `http://127.0.0.1:55334`
- Smart Lock provider: `simulated`
- Smart Lock live command: `false`
- Browser mode: Hybrid Interactive QA with two isolated Chrome profiles

## Accounts

- Admin: `dev.admin@kostation.test`
- Penghuni: `dev.resident.alpha@kostation.test`
- Password: masked

## Commands

- `node dist/main.js`
- `npm.cmd --workspace @granada-kost/admin run dev -- --host 127.0.0.1 --port 55333 --strictPort`
- `npm.cmd --workspace @granada-kost/penghuni run dev -- --host 127.0.0.1 --port 55334 --strictPort`
- `C:\Program Files\Google\Chrome\Application\chrome.exe --role=admin --remote-debugging-port=19222`
- `C:\Program Files\Google\Chrome\Application\chrome.exe --role=penghuni --remote-debugging-port=19223`

## Routes Tested

- Admin `/login`
- Admin `/payments`
- Admin `/complaints`
- Admin `/smart-lock`
- Penghuni `/login`
- Penghuni `/billing`
- Penghuni `/complaints`

## Flow Results

- API health: PASS
- Unauthenticated admin file endpoint check: PASS
- Admin manual login and Dashboard render: PASS
- Penghuni manual login and Home/Tagihan Aktif render: PASS
- Penghuni manual payment proof upload: PASS
- Admin payment proof preview: PASS
- Penghuni complaint create without attachment: PASS
- Penghuni complaint create with attachment: PASS
- Admin complaint attachment preview: PASS
- Negative upload UX: PASS
- Admin Smart Lock simulated safe state: PASS

## Test Data Created

- Complaint without attachment: `M14C no attachment 1783145262283`
- Complaint with attachment: `M14C with attachment 1783145265487`

## Console And Network Observations

- No fatal console error observed.
- No unexpected happy-path 400/500 observed.
- Only favicon `404` entries were recorded in network error candidates.
- Dialog accessibility warnings were observed for missing description/`aria-describedby`; not a blocker for M14C demo readiness.

## Leakage Observations

- Leakage findings: 0.
- No `storage_path`, `storagePath`, public storage URL, Tuya secret, `local_key`, `ticket_key`, or raw provider payload was found in captured API JSON bodies.
- File previews used backend-mediated authorized access.

## Artifacts

- `artifacts/m14c-browser-regression/README.md`
- `artifacts/m14c-browser-regression/qa-summary.json`
- `artifacts/m14c-browser-regression/browser-console-sanitized.json`
- `artifacts/m14c-browser-regression/network-summary-sanitized.json`
- `artifacts/m14c-browser-regression/leakage-check.txt`
- `artifacts/m14c-browser-regression/limitations.md`
- `artifacts/m14c-browser-regression/screenshots/`

## Screenshots

- `admin-login.png`
- `admin-dashboard.png`
- `penghuni-login.png`
- `penghuni-dashboard.png`
- `penghuni-billing-manual-proof.png`
- `penghuni-billing-proof-preview.png`
- `penghuni-billing-proof-pending-review.png`
- `admin-payments-before-verification-tab.png`
- `admin-payments-verification.png`
- `admin-payment-proof-preview.png`
- `penghuni-complaints-list.png`
- `penghuni-complaint-create-no-attachment.png`
- `penghuni-complaint-create-success.png`
- `penghuni-complaint-upload-preview.png`
- `penghuni-complaint-create-with-attachment-success.png`
- `admin-complaint-detail-attachments.png`
- `admin-complaint-attachment-preview.png`
- `invalid-file-error.png`
- `oversized-file-error.png`
- `admin-smart-lock-simulated-safe-state.png`

## Limitations

- Automated login, invalid-login, and browser RBAC credential-entry checks were skipped by request for Hybrid Interactive QA.
- Login was completed manually in isolated Chrome profiles to avoid shared refresh-cookie collisions between Admin and Penghuni.

## Issues

- None.

## Verdict

PASS — M14C Browser Regression / Internal Demo Flow is ready for the M14 surface demo evidence pack.
