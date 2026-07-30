# Executor–Reviewer Runbook

Status: **APPROVED PLANNING — NOT IMPLEMENTED**

## 1. Objective

This runbook minimizes repeated handoffs while preserving an independent,
evidence-based review. The executor owns completeness before review. The
reviewer owns one comprehensive audit, finding freeze, safe in-scope fixes, and
final approval.

The process optimizes total cycle time, not the appearance of a fast first
handoff.

## 2. Roles

### Agent Leader

- selects the roadmap package and requirement IDs;
- freezes business decisions and evidence boundaries;
- approves coherent atomic scope amendments;
- resolves genuine product decisions;
- prevents scope drift and false completion claims.

### Executor

- discovers the live implementation path;
- creates RED evidence;
- implements the complete vertical slice;
- runs validation;
- performs an adversarial self-review;
- fixes all known in-scope findings;
- hands off once as `READY FOR FINAL REVIEW`.

### Reviewer-Fixer

- independently audits the complete final patch;
- records all findings in one Finding Freeze;
- fixes every safe issue inside the allowlist;
- requests the smallest scope amendment only when the live path proves it
  necessary;
- validates the final delta;
- returns approval or a genuine blocker.

The reviewer is not a rubber stamp. The reviewer also is not a message relay for
fixes they can safely make.

## 3. Working Modes

### Fast Ship

Use for a bounded slice with:

- no schema migration or one trivial additive migration;
- one domain authority;
- small UI surface;
- limited concurrency or financial risk;
- focused runtime smoke.

Fast Ship still requires RED/GREEN, self-review, finding freeze, and exact scope.

### Hard Ship

Use for:

- lifecycle state changes;
- identity/account provisioning;
- financial ledger or report changes;
- migration/backfill;
- concurrency/idempotency;
- public/private wire changes;
- multiple linked surfaces.

Hard Ship requires an explicit state matrix, lock/transaction plan, migration
preflight, reconciliation, and failure-injection coverage.

Target durations are non-binding. A package stays `NOT READY FOR REVIEW` until
its acceptance contract is complete.

## 4. Leader Package Brief Template

```text
KMO-<package> — <title>

Mode: Fast Ship | Hard Ship
Expected HEAD: <sha>
Requirement IDs: <exact list>
Authority docs: <exact paths>
Objective: <one coherent user-visible outcome>

Preflight:
- inspect live route/module/service/repository path;
- snapshot HEAD, index, dirty baseline, protected hashes;
- verify schema and fixture prerequisites read-only;
- list all compatibility consumers.

Initial allowlist:
- <file list>

Coherent atomic exception:
- allowed only when the real live path proves another file is required;
- stop before editing it and request exact amendment with evidence.

Acceptance:
- <business state matrix>
- <wire/parser contract>
- <transaction/idempotency/concurrency contract>
- <UI/cache/a11y contract>
- <migration/reconciliation contract>

Validation:
- RED and GREEN focused tests;
- relevant regressions;
- formatter/lint/typecheck/build;
- aggregate gate as specified;
- proportional API/browser/migration evidence;
- git diff --check;
- index empty.

Prohibited:
- unrelated edits;
- broad migration replay;
- credential logging;
- provider/external calls;
- stage/commit/push;
- false runtime claims.

Exit:
- NOT READY FOR REVIEW while incomplete;
- READY FOR FINAL REVIEW only after zero known in-scope findings;
- BLOCKED only for a genuine external prerequisite or scope decision.
```

## 5. Executor Workflow

### 5.1 Discovery

1. Read the package requirements, policies, lifecycle, data, API, and QA
   contracts completely.
2. Use code graph and targeted source inspection to find the registered live
   route and actual call chain.
3. Verify database truth separately from source assumptions.
4. Identify current tests that will fail or need compatibility updates.
5. Record risks before editing:
   - authorization order;
   - transaction boundary;
   - idempotency;
   - lock order;
   - backfill;
   - stale scope/cache;
   - public/private wire;
   - audit/event;
   - rollback.

### 5.2 Scope Freeze

The allowlist includes every file needed for one coherent behavior, not every
file that might be convenient. It includes focused tests from the start.

If the live path proves a missing file:

```text
BLOCKED — ALLOWLIST

Required file:
- <path>

Evidence:
- <live registration/call path>

Smallest change:
- <specific responsibility>

Why current allowlist would false-green:
- <reason>

No file edited after discovery.
```

The leader normally approves the smallest coherent amendment immediately when
evidence is conclusive.

### 5.3 RED

RED evidence must fail for the intended absence, not for missing imports,
formatting, credentials, or unrelated environment setup. It should target:

- actual requester/controller;
- actual SQL/transaction client;
- actual parser/cache;
- exact state transition;
- claimed invariant.

### 5.4 Implementation

- Keep domain authority on the server.
- Use exact input/output contracts.
- Authorize before scoped lookup, idempotency claim, or write.
- Use a single transaction client for all command writes, audit, and outbox.
- Use deterministic locks.
- Use stable idempotency for one logical action.
- Separate lifecycle and financial concepts.
- Fail closed on malformed or ambiguous state.
- Preserve compatibility only through explicit paths.
- Implement complete loading/empty/error/forbidden/retry and stale-scope UI.

### 5.5 Executor Self-Review

Before handoff, run one adversarial pass over:

- happy path;
- empty and malformed input;
- duplicate/replay;
- concurrent commands;
- authorization reorder/removal;
- cross-property/cross-account;
- audit/outbox failure;
- stale response after scope switch;
- hidden PII/internal IDs;
- legacy consumers;
- migration replay;
- report reconciliation;
- accessibility and responsive behavior;
- unrelated diff.

Fix every finding. Do not send a knowingly incomplete patch to the reviewer.

### 5.6 Handoff

The executor sends the actual result and evidence first, followed by the
reviewer prompt in the same message. This avoids losing scope or asking the
reviewer to infer what changed.

Required handoff:

```text
READY FOR FINAL REVIEW

Diagnosis:
- <root cause>

Final behavior:
- <authority and lifecycle>

Files:
- <exact modified/new/deleted>

RED → GREEN:
- <counts and why RED failed>

Validation:
- focused;
- regressions;
- lint/typecheck/build;
- aggregate;
- migration/runtime if required;
- diff/index/integrity.

Known notes:
- <only true non-blocking notes>

No DB/service/browser/stage/commit/push unless explicitly authorized.
```

## 6. Reviewer-Fixer Prompt Template

```text
KMO-<package> Final Reviewer-Fixer

Mode: independent audit → finding freeze → fix → validate → final approval
Expected HEAD: <sha>
Requirement IDs: <exact list>
Authority docs: <exact paths>
Do not commit or push.

Edit allowlist:
- <exact final list>

Phase A — Audit; do not edit first:
1. Snapshot final diff and allowlist hashes.
2. Trace live routes, services, repositories, parsers, cache, and migrations.
3. Audit the entire package once:
   - business lifecycle and state matrix;
   - property/account/building scope;
   - transaction/idempotency/concurrency/rollback;
   - migration/backfill/replay;
   - wire whitelist/privacy/audit/event;
   - UI/access/cache/stale scope/a11y/responsive;
   - compatibility and focused-test mutation sensitivity.
4. Record all concrete findings as Finding Freeze.
5. Do not invent acceptance criteria after freeze unless a fixer introduces a
   concrete regression.

Phase B — Fix:
- fix every safe finding within allowlist;
- do not return REQUEST CHANGES for an issue you can safely fix;
- do not weaken a business invariant to make a test pass;
- do not create tests tied only to formatting/internal style;
- if another live-path file is essential, stop before editing it and return
  BLOCKED — ALLOWLIST with exact evidence.

Phase C — Validate:
- rerun focused and relevant regressions;
- formatter/lint/typecheck/build as proportional;
- aggregate exactly as specified;
- migration/runtime only when authorized;
- git diff --check and index check;
- re-audit only final delta against Finding Freeze.

Exit only:
- APPROVE;
- APPROVE WITH NOTES for true non-blocking/baseline notes;
- BLOCKED for an external decision, environment condition, or required file
  outside allowlist.

Final handoff:
- decision;
- Finding Freeze;
- fixes;
- authority/state/transaction proof;
- mutation proof;
- validation matrix;
- final file scope;
- integrity;
- confirmation not committed.
```

## 7. Finding Severity

| Severity            | Meaning                                                                    | Outcome                                                    |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Critical            | Data loss, cross-scope disclosure, credential/payment compromise           | Fix before approval                                        |
| High                | Broken canonical lifecycle, financial inconsistency, concurrency loss      | Fix before approval                                        |
| Medium blocking     | User-visible contract or regression-proof gap that can ship wrong behavior | Fix before approval                                        |
| Medium non-blocking | Bounded weakness without incorrect current behavior                        | Approve with explicit note only when deferral is justified |
| Low                 | Polish or maintenance note outside acceptance                              | Note/backlog                                               |

Calling every observation “blocking” is discouraged. Hiding a real lifecycle or
financial defect as a note is prohibited.

## 8. Scope Amendment Rules

A coherent atomic exception is approved when:

- the file is on the registered live path;
- omitting it creates dead code or a false-green test;
- its change is the minimum needed to complete the original behavior;
- no separate product decision is introduced.

It is not approved when:

- it is cleanup unrelated to the package;
- it broadens roles/features without authority;
- it activates a provider or environment;
- it rewrites adjacent modules merely for style.

## 9. Migration Runbook

### 9.1 Preflight

- exact expected HEAD and clean index;
- development/test environment;
- exact host, port, database, SSL, connected database;
- canonical tracked migration hash;
- prerequisite and absence/partial-state checks;
- read-only counts and fingerprints;
- no service or domain mutation.

Output:

```text
KMO-<package> MIGRATION PREFLIGHT PASS
...
Reply exact: approve <package> migration
```

### 9.2 Execution

- use ledgered runner or approved targeted `psql`;
- execute exactly once with stop-on-error;
- no seed, repair, or fallback;
- do not replay historical migrations;
- capture exit and transaction result without credentials.

### 9.3 Postcheck

- schema/constraint/index exact;
- backfill/mismatch exact;
- unrelated counts/fingerprints unchanged;
- Git/source hash unchanged;
- no residual credential.

## 10. Runtime Smoke Runbook

### 10.1 Preflight

- services and port ownership;
- exact environment and database;
- process-only credentials available;
- candidate fixture and before fingerprints;
- exact request/mutation budget;
- cleanup/restore strategy.

If credential is unavailable, stop before database/service mutation and report
`DEFERRED — CREDENTIAL` when the package contract permits deferral.

### 10.2 Execution

- register network/response waits before actions;
- one logical submit, no retries unless planned;
- inspect actual request method, headers, payload, response, and DOM;
- verify reload persistence;
- record domain mutation and external-host counts;
- do not print credentials or tokens.

### 10.3 Cleanup

- close disposable browser/profile;
- remove temporary credentials/scripts/logs;
- stop only disposable services;
- restore adopted canonical services if they were changed;
- delete only an exact verified disposable database;
- prove canonical fingerprint and Git integrity.

An environment or launcher failure is not fixed by silently pointing a
disposable test at the canonical database.

## 11. Commit Runbook

After approval:

1. Verify reviewer final hashes/diff remain current.
2. Stage exact allowlist only.
3. Inspect staged file names and staged diff check.
4. Commit with one domain-focused subject.
5. Confirm index empty and unrelated baseline remains unstaged.
6. Do not amend or push unless separately instructed.
7. Record SHA, subject, stat, exact files, index, and untouched baseline.

## 12. Communication Rules

- Lead with outcome and evidence.
- Never claim a test/build/runtime action that was not executed.
- Avoid repeated “please approve” loops for reversible in-scope work.
- Ask the product owner only for a decision that materially changes business
  behavior, external state, access, money, or scope.
- Recommended defaults in the approved planning package do not require
  re-confirmation during implementation.
- Screenshots are not required when the written behavior is already canonical.
- A blocker must state the smallest safe next action.

## 13. Definition of Ready for Review

`READY FOR FINAL REVIEW` is valid only when:

- all selected requirement IDs are implemented;
- no TODO, placeholder, fake save, or dead route remains in scope;
- RED/GREEN and mutation proofs are credible;
- executor self-review found no unresolved in-scope issue;
- required validation passed or is honestly classified;
- final diff and baseline integrity are known;
- no unauthorized DB, service, provider, Git, or external mutation occurred.

Anything less remains `NOT READY FOR REVIEW`.
