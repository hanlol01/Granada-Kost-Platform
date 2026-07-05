# M15A — Internal Demo Delivery / Stakeholder Review Package

> **Milestone:** M15A (documentation only — no implementation, no QA execution, no live commands)
> **Date:** 2026-07-04
> **Role:** Kostation Release / Stakeholder Demo Reviewer
> **Status:** Delivery package recorded; input for the stakeholder review session and the post-demo decision log
> **Binding inputs:** `docs/14-production-readiness/RELEASE_READINESS_VERDICT.md` (M14F), `docs/14-production-readiness/INTERNAL_DEMO_SCRIPT_REFRESH.md` (M14D — the binding demo script), `docs/14-production-readiness/BROWSER_REGRESSION_INTERNAL_DEMO_FLOW.md` (M14C, PASS), `docs/14-production-readiness/API_REGRESSION_SECURITY_SMOKE.md` (M14B, PASS), `docs/14-production-readiness/PRODUCTION_READINESS_AUDIT.md` (M14A), `docs/13-smart-lock/SMART_LOCK_READY_FOR_SITE_TRIAL_EXECUTION_PENDING_FREEZE.md` (M13F-D), `docs/13-smart-lock/SMART_LOCK_LIVE_SITE_TRIAL_GO_NO_GO_DECISION.md` (M13F-C4), `docs/00-project/` governance docs (M14E state)
> **Evidence inputs:** `artifacts/m14b-api-regression-smoke/`, `artifacts/m14c-browser-regression/`, `artifacts/m13f-c4-site-evidence-pack/`
>
> This document contains **no real secrets and no real device IDs**. All credentials are masked or placeholders.
> No lint, typecheck, build, API smoke, browser QA, migration, or any terminal command was run for M15A. GitLab Duo has no shell access; all cited validation results were produced earlier and externally (Codex) and are referenced from committed documents/artifacts, not re-executed here.
> **No live Smart Lock command was executed for this document.** `SMART_LOCK_LIVE_ENABLED` remains `false`.
> **Smart Lock live integration is NOT marked complete by this document. Production is NOT marked ready.** ADR-SL-001 and all M13 freezes remain binding and unchanged.

---

## 1. Executive Summary

- **Internal demo package: READY** (M14F verdict; M14B API smoke PASS; M14C browser regression PASS; M14D script in place).
- **Production release: NOT READY** (per M14F; blockers P0–P2 open).
- **Smart Lock live execution: NO-GO / site-trial pending** ("ready for controlled site trial preparation, execution pending").
- **Demo objective: stakeholder review and feedback — NOT production approval.** No decision in this session upgrades production or Smart Lock live status by itself.
- **The demo must use the M14D script** (`INTERNAL_DEMO_SCRIPT_REFRESH.md`) **and stay within M14C-validated scope.** M14C artifacts serve as fallback evidence.

## 2. Demo Objectives

1. Validate core Admin and Penghuni flows with the stakeholder.
2. Confirm acceptance of the manual payment proof workflow (`pending_review`; admin verification = settlement authority).
3. Confirm acceptance of the complaint attachment workflow (0–5 photos, transactional attach).
4. Confirm file preview behavior (backend-mediated authorized access; no `storage_path`, no public URLs).
5. Confirm the Smart Lock scope and limitations are understood (Section 8 wording).
6. Collect production readiness expectations (timeline, required features, storage direction).
7. Collect next feature priorities (payment gateway, CCTV, receipts, others).

## 3. Demo Scope

**Safe to demo (M14C-validated):**

- Admin login + dashboard.
- Penghuni login + dashboard (Home).
- Manual payment proof upload (Penghuni).
- Admin payment proof preview/review (verify/reject).
- Complaint create without attachment (Penghuni).
- Complaint create with attachment (Penghuni).
- Admin complaint attachment preview.
- Invalid/oversized upload negative UX.
- Smart Lock simulated / read-only / guarded disabled state (`LIVE_COMMAND_DISABLED` = correct fail-closed behavior).

**NOT to demo as production-ready:**

- Physical live Smart Lock unlock.
- Remote lock.
- Temporary PIN.
- Resident unlock.
- Smart Lock fleet rollout.
- Production deployment.

## 4. Recommended Agenda (30–45 minutes total)

| # | Segment | Est. time | Content |
| --- | --- | --- | --- |
| 1 | Opening and context | 3 min | Demo objective = review/feedback, not production approval; scope boundaries |
| 2 | Release verdict summary | 3 min | M14F: demo READY, production NOT READY, Smart Lock site-trial pending |
| 3 | Admin flow | 4 min | Login, dashboard (M14D segment B) |
| 4 | Penghuni flow | 4 min | Login, Home, Tagihan Aktif (M14D segment C) |
| 5 | Payment proof flow | 6 min | Upload → `pending_review` → admin preview/verify (M14D segments D–E) |
| 6 | Complaint attachment flow | 6 min | Create with/without attachment → admin preview; negative UX (M14D segments F–I) |
| 7 | Smart Lock safety/status explanation | 4 min | Simulated/read-only/guarded disabled + Section 8 wording (M14D segment J) |
| 8 | Production blockers explanation | 3 min | M14F P0–P2 blockers, pre-production checklist |
| 9 | Stakeholder feedback | 7 min | Section 6 feedback form |
| 10 | Decision summary and next action | 5 min | Section 7 decision log; select next milestone (Section 10) |

Total: ± 45 minutes (compressible to 30 by shortening segments 3–4 and 9).

## 5. Presenter Checklist

- [ ] Latest `master` code pulled (matching M14B/M14C evidence lineage).
- [ ] Backend + Admin + Penghuni frontends running; health endpoint OK (database + Redis up).
- [ ] Demo accounts prepared (see M14D Section 4; passwords masked, never shown).
- [ ] Test upload images ready (valid JPEG/PNG ≤ 2 MB; one invalid-type file; one oversized file).
- [ ] No real secrets visible anywhere on screen; `.env` never opened.
- [ ] Browser windows prepared: two isolated profiles (Admin / Penghuni), logged out at `/login`.
- [ ] M14C screenshots open locally as fallback (`artifacts/m14c-browser-regression/screenshots/`).
- [ ] Smart Lock env verified: `SMART_LOCK_PROVIDER=simulated`, **`SMART_LOCK_LIVE_ENABLED=false` — stays false**.
- [ ] M14D script open (`INTERNAL_DEMO_SCRIPT_REFRESH.md`) as presenter guide.
- [ ] Evidence links ready (Section 9) for the verdict/blockers discussion.

## 6. Stakeholder Feedback Form

| # | Question | Stakeholder answer | Priority | Owner | Due date | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Is the Admin dashboard flow acceptable? | | | | | |
| 2 | Is the Penghuni dashboard flow acceptable? | | | | | |
| 3 | Is the payment proof flow acceptable? | | | | | |
| 4 | Is the admin review/preview flow acceptable? | | | | | |
| 5 | Is the complaint attachment flow acceptable? | | | | | |
| 6 | Are the file type/size restrictions acceptable (JPEG/PNG 2 MB, PDF 5 MB, max 5 photos)? | | | | | |
| 7 | Is the WhatsApp fallback acceptable operationally? | | | | | |
| 8 | Is the Smart Lock current status understood (site-trial pending, live NO-GO)? | | | | | |
| 9 | Is Smart Lock live required for the first production release? | | | | | |
| 10 | Is production deployment expected before the Smart Lock site trial? | | | | | |
| 11 | Which blockers must be resolved before production (from M14F P0–P2)? | | | | | |
| 12 | What are the top 3 next features? | | | | | |
| 13 | What changes are mandatory before the next demo? | | | | | |

## 7. Decision Log Template

| Decision | Options | Selected option | Decision owner | Date | Follow-up action |
| --- | --- | --- | --- | --- | --- |
| Internal demo accepted/rejected | Accepted / Accepted with notes / Rejected | | | | |
| Production release | Approved / Rejected / Deferred | | | | (Note: approval still requires M14F pre-production checklist completion) |
| Smart Lock live requirement for production | Required for v1 / Not required for v1 / Decide later | | | | |
| Storage direction | Local disk / Object storage (S3) / Decide later | | | | |
| Payment gateway priority | High / Medium / Low / Deferred | | | | |
| CCTV priority | High / Medium / Low / Deferred | | | | |
| Next milestone selection | M15B / M13F-C5 / M15C / Other | | | | |
| Site trial scheduling decision | Schedule now / Wait for site access / Deferred | | | | (Execution stays NO-GO until M13F-C4 Sections 6–7 complete) |

## 8. Smart Lock Stakeholder Wording

**Naskah wajib (gunakan kata-kata persis ini):**

> "Smart Lock sudah siap secara fondasi backend untuk controlled site trial, tetapi live unlock fisik belum dinyatakan production-ready. Eksekusi live masih NO-GO sampai ada approval lokasi, perangkat nyata, person-at-door, kunci manual, credential rotation confirmation, site-env diagnostic/sync, dan dry-run site-env yang PASS."

**What is ready:**

- Backend provider config + signing client + token cache (simulated default).
- Read-only diagnostic and sync (masked provider IDs, normalized safe failures).
- Command guard: fail-closed gates, RBAC, confirmation/reason/idempotency, rate limit, audit.
- Guarded live unlock transport (implemented; dry-run with live disabled PASS).

**What is pending:**

- Real site trial (M13F-C5): approvals, real device mapping, person-at-door, manual key, credential rotation confirmation, site-env diagnostic/sync/dry-run, Go/No-Go upgrade to execution GO.

**What must NOT be claimed:**

- "Smart Lock production ready" / "live unlock production ready" / unqualified "Smart Lock complete".
- Physical door can be opened now.
- Resident unlock, temporary PIN, remote lock, or fleet rollout are available.

## 9. Evidence References

- `artifacts/m14b-api-regression-smoke/` — M14B API regression & security smoke (PASS; `qa-summary.json`).
- `artifacts/m14c-browser-regression/` — M14C browser regression (PASS; `qa-summary.json` + 20 screenshots).
- `docs/14-production-readiness/INTERNAL_DEMO_SCRIPT_REFRESH.md` — M14D binding demo script.
- `docs/14-production-readiness/RELEASE_READINESS_VERDICT.md` — M14F verdict, blockers, decision matrix, checklists.
- `artifacts/m13f-c4-site-evidence-pack/` — M13F-C4.1 sanitized local/placeholder evidence pack (PASS; B-23 partially closed).

No raw secrets or real device IDs appear in any referenced artifact (leakage checks PASS).

## 10. Post-Demo Actions

1. Collect the completed feedback form (Section 6).
2. Update the decision log (Section 7) with owners and dates.
3. Create an issue/task list from feedback and mandatory changes.
4. Decide the next milestone with the stakeholder:
   - **Production path selected** → run **M15B — Production Deployment Checklist & Environment Hardening** (execute M14F Section 8 pre-production checklist).
   - **Smart Lock site trial selected** → prepare **M13F-C5 — Real Site Preflight and One-Device Live Trial** only after all approvals and M13F-C4 Sections 6–7 evidence are complete.
   - **Product feature path selected** → plan **M15C — Payment Gateway Planning / CCTV / selected feature**.
5. Record the session outcome in `CHANGELOG.md` and update `ROADMAP.md` Next Milestone accordingly (follow-up documentation milestone).

## 11. Risk and Fallback

| Risk | Fallback |
| --- | --- |
| Backend slow/down | Use M14C screenshots (`artifacts/m14c-browser-regression/screenshots/`) and narrate from the M14D script |
| Upload/preview slow | Show artifact screenshots (`admin-payment-proof-preview.png`, `admin-complaint-attachment-preview.png`) while explaining backend-mediated access |
| Login automation slow | Use manual login in isolated browser profiles (Hybrid Interactive mode, M14C-validated) |
| Smart Lock page unavailable | Show `RELEASE_READINESS_VERDICT.md` Section 5 and the M14B guard results / M13F-C4.1 pack summary |
| Any situation | **NEVER enable `SMART_LOCK_LIVE_ENABLED=true` during the internal demo**; never switch provider to `tuya` |
| Screen sharing | Do not show `.env`, secrets, password managers, or provider consoles |

## 12. Acceptance Checklist

- [x] Demo delivery package created (`docs/15-stakeholder-demo/INTERNAL_DEMO_DELIVERY_PACKAGE.md`).
- [x] Stakeholder feedback form included (13 questions with answer/priority/owner/due/notes fields).
- [x] Decision log template included (8 decisions with options/owner/date/follow-up fields).
- [x] Smart Lock wording safe (mandatory quote + ready/pending/must-not-claim lists).
- [x] Production NOT marked ready.
- [x] No code implementation (documentation only).
- [x] No live Smart Lock execution (`SMART_LOCK_LIVE_ENABLED` remains `false`).
- [x] Next actions defined (Section 10: M15B / M13F-C5 / M15C paths).
