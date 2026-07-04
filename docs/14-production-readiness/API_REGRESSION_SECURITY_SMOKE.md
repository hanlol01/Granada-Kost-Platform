# M14B - API Regression & Security Smoke

## Scope

Backend/API regression and security smoke across core M12-M13 features: auth/session, RBAC, property/self scope, File API, manual payment proof, complaint attachment, Smart Lock read-only sync, Smart Lock command guard, audit/security sanity, and leakage checks.

## Environment

- Timestamp: 2026-07-04T04:57:55.980Z
- Commit: 5f1b96b
- Branch: master
- API mode: backend child process on http://127.0.0.1:3016/api/v1
- Smart Lock provider: simulated
- Smart Lock live enabled: false
- Browser QA: not executed
- Frontend changes: none
- Live Smart Lock unlock: not executed

## Commands Run

- `git status --short`
- `git branch --show-current`
- `git rev-parse --short HEAD`
- `git log --oneline -8`
- `git diff --cached --name-only`
- `git ls-files '.env*' '**/.env*'`
- `npm.cmd run lint:api`
- `npm.cmd run build:api`
- `npm.cmd run smartlock:validate-runtime`
- `git diff --check`
- `npm.cmd run db:migrate:api`
- `node artifacts/m14b-api-regression-smoke/m14b-runner.mjs`

## Endpoint Groups Tested

- Auth/session: PASS
- RBAC/role boundary: PASS
- Property/self scope: PASS
- File API: PASS
- Manual payment proof: PASS
- Complaint attachment: PASS
- Smart Lock read-only: PASS
- Smart Lock command guard: PASS
- Audit/security sanity: PASS
- Leakage: PASS

## Results Summary

- Health endpoint: PASS
- Admin login: PASS
- Resident alpha login: PASS
- Resident bravo login: PASS
- Property owner login: PASS
- Invalid login rejected: PASS
- Valid file upload, metadata, content, delete negative paths: PASS
- Payment proof remains pending review and invoice remains not paid: PASS
- Complaint creation with and without attachment: PASS
- Smart Lock command guard returns fail-closed responses with live disabled: PASS

## Failures / Blockers

- None.

## Security / Leakage Result

- Result: PASS
- Forbidden marker hits: none
- Raw provider id values checked: 5
- Auth login tokens were used only in memory and are not written to artifacts.
- File metadata/admin attachment responses were checked for storage path exposure.

## Limitations

- Cross-property denial was not fully testable because only one local seed property was exposed to admin.

## Verdict

PASS - API regression and security smoke passed for M14B. Internal demo API posture remains healthy. Production remains NOT READY per M14A.

## Recommended Next Milestone

Proceed to M14C browser regression / visual demo pass after reviewing this M14B evidence pack. Keep Smart Lock live execution NO-GO until site-trial prerequisites are satisfied.
