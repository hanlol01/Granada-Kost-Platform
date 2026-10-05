# Handoff 08 implementation progress and evidence

Status: `IMPLEMENTED AND VERIFIED LOCALLY — PRODUCTION RELEASE NOT AUTHORIZED`
Started: 3 October 2026
Latest verified slice: 5 October 2026 — official local migrations 115–124, matching API restart, preserved data fingerprints and user-confirmed PDF/Excel saving
Baseline: `854811987cfbd7c47534873a3e094cb6a98cbcdc`

The approved scope is [Handoff 08](08_LEASE_CORRECTION_CANCELLATION_ARCHIVE_PURGE_PLAN.md).
This file records implementation evidence; it does not replace or narrow the plan.
Local backup, migrations 115–124 and API restart were explicitly approved for
final verification on 5 October. VPS/production changes, commit and push remain
outside that approval. Existing scratch files and unrelated skill changes
are outside this work's ownership.

The full approved source scope is implemented. Automated, database/storage and
recorded runtime checks pass. The user confirmed that both PDF and Excel from
the local Admin Owner report are saved and can be opened, closing the remaining
manual file-save acceptance gate.
The final requirement-to-evidence matrix and release boundary are authoritative.
Earlier sections retain development checkpoint findings, including restrictions
and pending checks that later evidence superseded; they are not current status.
The main local database has received migrations 115–124 and the matching API
was restarted. Automated native download capture remains a tooling limitation;
the manual result is user-reported, not an agent-observed operating-system save.
Owner exports retain their independently verified authenticated HTTP/document
and real portal UI evidence; no separate Owner native save is claimed.

## Discovery boundary

- The graph server has no indexed KOSTATION project. Current source and local
  read-only PostgreSQL queries are the evidence; there is no claim of exhaustive
  graph coverage.
- Local migration ledger checked through a loopback-only, read-only proof:
  latest `114_check_in_anchored_lease_period.sql`. The next migration version
  must be resolved again at migration/deployment preflight, not inferred from
  this record.
- Existing lease correction is append-only and owns period/tariff changes.
  Physical check-in remains the effective period authority. Correction must
  not introduce check-in for a resident who has never received the room.
- `leases`, `lease_activation_lifecycles`, `occupancies`, and actual
  `room_transfer_records` distinguish activation-only from real occupancy.
- `lease_checkout_commands`, scheduled `lease_transfer_commands`, and pending
  `lease_renewal_commands` are independent lifecycle authorities that must not
  be bypassed by revision commands.
- Financial history includes payment-proof claims, payments linked directly or through allocations,
  reversals, lease deposit transactions, deposit/checkout/booking refunds,
  recognized Owner earnings, and Owner-realization locks. Pending, rejected,
  and reversed payment records are still history, not an assumed zero.
- `onboarding_commitments` owns the original room commitment and room hold;
  room correction/cancellation must also reconcile this relationship, not
  merely update `leases.room_id` or the room status.
- Sponsored terms retain a charged/waived fee policy and payer separately from
  rent. Zero rent must not imply a waived management fee. The current fee-progress
  view exposes its primary key as `id`, not `term_id`.
- `files` records metadata and local storage paths. Lease-exclusive inventory,
  durable claims, physical deletion verification, shared-file protection, retry
  and immutable results are implemented and proved below. Metadata-only hiding
  is never claimed as freed disk space. Unclaimed missing-file discovery still
  needs its separate read-projection repair.

## Implemented slice: consistent revision context

`GET /leases/:leaseId/revision-context` is Admin-only and requires
`lease.manage` plus property scope. It performs a repeatable-read, read-only
transaction and returns:

- Resident/lease identity, room code, manager label, and plot number.
- Recorded dates, planned arrival, duration, and effective dates. Effective
  start/end stay `null` while service is pending physical check-in.
- Current tariff/contract and Owner-sponsored policy without inferring the
  policy from a zero amount.
- Financial relationship counts and amounts.
- Separate eligibility decisions for basic correction, administrative room
  correction, commercial-mode change, sponsor/fee-policy change, and
  cancellation. Each rejection has a stable code, a safe Indonesian reason,
  and a next action. These are review decisions, not permission to skip
  commit-time validation or evidence/conflict checks.

`LeaseRevisionContextService` is registered in the existing lease module. Its
policy authority is reused by the staged correction and cancellation reviews.
Context eligibility alone does not authorize a mutation.

### Adjacent correction fixes

- Sponsored duration correction used `progress.term_id`, which does not exist
  in the actual database view. It now joins on `progress.id`. Read-only SQL
  planning validates the actual UPDATE text without executing the write.
- Simultaneous identical correction requests previously checked replay before
  acquiring the lease aggregate lock. The second command could fail on the
  unique command key or on a no-change preview instead of replaying the first
  result. The command now uses onboarding's advisory/property/lease lock order
  before its replay check. This preserves the existing append-only amendment
  and one financial application, without a reversed property/lease lock order.

## Implemented slice: administrative room-recording correction and evidence

The existing correction preview/commit accepts optional `room_id`, explicit
`room_recording_error_confirmed`, and up to five
`room_correction_evidence_file_ids`. This is a falsely recorded room correction,
not a physical transfer. An omitted or unchanged room is a no-op. It cannot
introduce check-in for a lease that has never been occupied.

- Server validation reads real room/building/kost-type/property/gender
  authorities. Only a vacant target without conflicting leases, occupancies,
  commitments, holds, or scheduled transfers is eligible. Unknown categories
  and incomplete facts fail closed.
- The source must match the current lease, occupancy, commitment and hold.
  Other source-room claims prevent release. Expected commitment/hold row counts
  are checked during writes, not inferred from the UI room status.
- A checked-in recording error needs private evidence. Active source-room
  smart-lock grants require canonical access revocation first; this correction
  does not silently revoke hardware access or issue a new key.
- Room and check-in-date amendments require separate reviews. The physical
  check-in date remains the period authority.
- Before/after room code, manager label, plot number, kost type and evidence IDs
  are appended to the correction snapshots. Empty target identifiers remain
  empty, rather than falling back to identifiers belonging to the old room.
- Commit rebinds the same lease/occupancy/current commitment and live hold,
  preserves original booking dates/prices, and records administrative
  `status_sync` events on both involved rooms. It creates no fictitious transfer,
  new occupancy, or inspection event.
- Owner-sponsored targets must retain the sponsoring Owner. A paid sponsorship
  cannot silently switch its ownership-assignment relationship. Full
  commercial-mode and combined room/sponsor correction now have separate
  preview/commit authorities and disposable PostgreSQL proofs. The standalone
  recorded sponsorship-policy authority is described below.
- Preview resolves the target room's commercial reference through the existing
  pricing authority. Identical snapshot values are compared structurally;
  reordering fields is not a reason to append an amendment.

Migration `115_lease_correction_room_evidence.sql` adds the private upload
purpose and append-only, property/lease-scoped evidence links. The insert trigger
validates live JPEG/PNG/WebP/PDF files up to 5 MiB and locks the file row to
serialize attachment. A unique immutable `lease_revision_file_bindings` row
and a composite evidence FK retain one owning lease per upload, including under
repeatable-read snapshots. The same file may support multiple amendments of
that lease; it cannot be assigned to a different lease. No operational,
financial or issued-document records are backfilled by this migration.

The file API checks property scope and Admin lease permissions before reading
private correction evidence; deletion needs `lease.manage`. Non-Admin users,
including the uploader and Property Owner, cannot read it. Normal metadata
deletion locks the file, then re-reads its attachments; attached or uncertain
evidence cannot be hidden through ordinary upload removal. Safe download names
use the lease code, correction sequence and per-amendment file number. This is
not the archive purge feature and does not claim to free physical bytes.

The staged Admin correction page and cancellation/archive workspace are now
wired. Browser end-to-end verification against the current API remains pending;
the user-running API still returns 404 for the new revision-context endpoint.
Restore/successor and physical file purge are implemented below; complete runtime,
role and document-projection verification remains required.

## Implemented slice: recorded sponsorship-policy correction

The existing Admin correction preview/commit accepts optional
`sponsoring_owner_profile_id`, `management_fee_mode`, `management_fee_payer`,
`management_fee_payer_name`, and `owner_sponsorship_reason` for an existing
Owner-sponsored lease. This is an administrative correction of recorded policy,
not a prospective policy change or a refund command.

- Omitted or canonically unchanged policy inputs remain a no-op. A rent lease
  cannot silently accept sponsorship fields; explicit mode conversion uses the
  separate commercial-mode revision authority.
- A changed policy requires complete, current revision facts and no related
  financial history. Pending, rejected and reversed records still count. The
  shared property/lease locks make commit-time review read payments that finished
  while the correction waited, rather than trusting the earlier preview.
- The proposed sponsor must match exactly one active ownership assignment for
  the actual room/property. A waived fee clears the current payer/name and amount;
  charging a waived fee requires an explicit valid payer. A third-party payer
  needs a name. Original payer and sponsorship instructions remain in history.
- Charged projections resolve the effective fee for every corrected service
  month using the existing property fee authority, not the first month multiplied
  by duration. Missing/unsafe values fail closed with a specific review message.
- Preview includes before/after sponsorship facts and the effective date.
  Amendment snapshots bind that complete policy to its lease, property, actor
  and reason. A policy version is appended before current projections are
  changed. Compare-and-set application and the encompassing transaction prevent
  partial updates. Original onboarding inputs and financial documents are not
  overwritten.
- Migration `116_owner_sponsored_policy_revisions.sql` adds immutable policy
  versions, composite term/amendment scope keys, and source/amendment validation.
  It has no historical-data backfill. Its current checksum is
  `49aa6752481d449d02ca9c97d7ffa8ed90422bd3d0e2918f737b90a9cc1bcb73`.

The standalone policy slice does not replace the commercial-mode authority.
Later disposable proofs cover mode conversion and combined room/sponsor changes,
including pre/post physical check-in. Full role/document/runtime verification
remains required before completion.

## Evidence — current slice only

- RED: 16 context/policy tests failed before the new authorities existed.
- GREEN: 16 executable policy/context behavior tests pass.
- RED: simultaneous identical correction commands failed with a duplicate
  command in the orchestration lock model.
- GREEN: three idempotency/authorization tests cover identical concurrent
  retries, changed payload/key reuse, and unauthorized/missing-key requests.
  This lock model does not replace PostgreSQL concurrency/rollback proof.
- Local read-only proof executed current SQL against 20 existing contexts,
  stratified across lease/service states and both `rent` and
  `owner_sponsored`. It inspected ledger 114 and planned the actual sponsored
  correction UPDATE with `EXPLAIN` (without `ANALYZE`); zero mutations.
- API production build passed after the context SQL fix. Re-run build/lint and
  the focused tests at each subsequent boundary.
- RED: five source-room/category/binding-count tests exposed missing guards;
  GREEN: all 18 room-authority behavior tests pass after adding them.
- RED: an Admin without lease permissions could read private proof;
  GREEN: eight file authorization, attachment-lock and naming tests pass.
- RED: identical commercial values with reordered snapshot keys were accepted
  as a correction; GREEN: two real preview integration tests pass, including
  the target commercial lookup and preservation of empty target identifiers.
- RED: 14 sponsorship behavior tests initially failed without the new authority;
  two real correction preview tests failed because policy-only changes were
  discarded as no changes. GREEN: the helper, DTO and main preview integrations
  now pass their behavior tests.
- Full focused slice suite: **96 tests pass**, including the existing 29
  period/correction regression tests. The evidence totals are 16 context,
  3 idempotency, 3 policy, 18 room, 8 file, 4 preview, 15 sponsorship and
  29 regression tests.
- Migrations 115 and 116 passed the **full official runner on a freshly created
  loopback disposable clone**: exact checksums and all sentinels, replay 0.
  Injecting a failure at each migration's ledger append rolled back that
  migration's DDL and ledger. Fingerprints of 11 resident/lease/room/occupancy/
  booking/financial/Owner tables stayed unchanged during migration execution.
- Actual PostgreSQL room-authority proof committed a pre-check-in room
  correction, verified source/target states, and preserved payments, invoices,
  payment receipts and Owner realizations. A deliberately unavailable evidence
  attachment after room writes caused the whole command transaction to roll
  back. This is not yet proof of full API-command concurrency or every
  post-check-in/sponsored case.
- A real two-client attachment/delete race proved deletion waits on the file
  row and re-reads the committed attachment before rejecting. Append-only
  mutation rejection, purpose validation and the actual download-numbering SQL
  also passed.
- A separate two-client repeatable-read race verified that a stale snapshot
  cannot allow two leases to claim one upload. Direct reassignment/deletion of
  the ownership binding is rejected; reuse by another amendment of the same
  lease succeeds. The final migration checksum is
  `8935f6c9e0aa240a7b7bbe4ff9abd3c3863c48a86f2e0234edbf21e97251bd9c`.
- Actual main correction-service transactions in the disposable PostgreSQL clone
  exercised charged/waived policy changes, explicit payer review, and the real
  fee-progress view. Two simultaneous identical submissions committed one
  amendment/version and replayed the same result. Direct policy mutation and a
  forged amendment/version pairing were rejected. An injected failure after
  version append rolled back the entire correction and all protected records.
- A real W06 cash management-fee payment acquired the shared aggregate lock
  before a simultaneous policy correction. `pg_blocking_pids` proved the
  correction actually waited on the payment transaction. After payment/receipt
  commit, correction rejected with `LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED`;
  its amendment/version counts did not change. Existing financial rows stayed
  unchanged; only the intentional clone-only payment and receipt were appended.
  This is a service/SQL concurrency proof, not an HTTP/JWT, every payment-method,
  or live UI test.
- API production build and scoped ESLint pass for the sponsorship/main correction
  service, DTO and module after this slice. Tracked, owned paths pass
  `git diff --check`; unrelated dirty skill and scratch files were preserved.
- Disposable tests did not touch physical file bytes. Each disposable clone was
  removed, and the final source-database fingerprints and ledger stayed
  unchanged at migration 114. No migration was applied to the primary local
  database or production.

Commands, from `backend/api`:

```powershell
node --test test/lease-revision/revision-context.behavior.cjs test/lease-revision/correction-idempotency.behavior.cjs test/lease-revision/correction-policy.behavior.cjs test/lease-revision/room-correction.behavior.cjs test/lease-revision/correction-evidence.behavior.cjs test/lease-revision/correction-room-preview.behavior.cjs test/lease-revision/sponsorship-correction.behavior.cjs test/lease-revision/correction-regressions.cjs
npm run build
$env:KOSTATION_REVISION_LOCAL_READ = '1'
node test/lease-revision/revision-context.local-read.cjs
$env:KOSTATION_REVISION_DISPOSABLE = '1'
node test/lease-revision/room-correction.disposable.cjs
```

The read-only proof rejects non-loopback connections and never applies
migrations or writes fixtures. The disposable proof also rejects production-like
sources, clones only the local development DB, validates a randomized target
through the existing disposable guard, runs writes only in that clone, and
validates its exact name before cleanup. Neither proof prints credentials or
resident identities.

## Latest cancellation/archive evidence (4 October)

- Migration `118_lease_cancellation_archive.sql` is additive and has checksum
  `3c38532942a5dcb69455379f753ae07a9e93e2242fa24c60db8f697b229c29d6`.
  The official runner applies/replays migrations 115–118 only in a guarded
  disposable clone; injected ledger failures prove transactional DDL rollback.
- Real PostgreSQL cancellation passes for a canonical no-money paid lease, a
  canonical Owner-sponsored lease, and a genuine pending-finance lease. Fixtures
  are created through onboarding and correction authorities, not by rewriting
  source payment/occupancy facts. Concurrent identical requests replay one
  command; changed payloads, wrong property, real occupancy, and stale reviews
  are rejected. An injected archive insert failure rolls back room, lease,
  resident and invoice changes. Immutable command update/delete is rejected.
- Finance-related cancellation retains invoices, payments and receipts unchanged
  and explicitly reports `pending_review`; no reversal or refund is fabricated.
  No-money invoices are voided through W06. Archive list/detail and room activity
  execute actual SQL. Source fingerprints/ledger remain unchanged; clone removed.
  Evidence archive: `a2f959befd406bed`.
- Strict frontend cancellation/archive contracts and existing correction/cache/
  form/message tests pass: 29 tests (`4bb30a4a80931f7b`). Admin typecheck passes
  (`1e52a42bdca8f915`). Admin and API builds pass (`7b5fae2af6984020`,
  `32c6bfa1f44c70d5`). These are not substitutes for live UI verification.
- Restoration eligibility has six executable policy tests. This evidence is now
  supplemented by the real restoration/successor proof below; eligibility tests
  alone do not prove a restore command or physical deletion.

## Latest restoration and linked-successor evidence (4 October)

- Additive migration `119_lease_archive_restoration.sql` checksum:
  `0fec55fd08af27bdbe04755450661d0970748e8765fd225561301be65356641c`.
  The official runner applies/replays 115–119 in a guarded clone and proves
  transactional rollback for every injected ledger-append failure. No primary
  database migration or service restart was performed.
- Actual PostgreSQL proves no-money paid, sponsored and administratively active
  without-check-in restoration; stale/scope denial; late rollback; concurrent
  replay; unchanged historical invoices/receipts/money; and no occupancy or
  physical check-in creation. Canonical onboarding atomically creates one linked
  successor for the same resident, keeps old pending finance unresolved, and
  rejects a duplicate successor or changed idempotent intent. Immutable commands
  reject deletion. Source fingerprints/ledger stay unchanged; clone is removed.
  Evidence: `0ae4bd03450585b0` (same-room replacement is the available source
  fixture; this does not claim a distinct-room replacement runtime proof).
- Restoration/successor history types are explicit. Room activity reads captured
  room IDs, not mutable current room pointers. Real SQL checks read-only restored
  and superseded detail/list records and captured activity. The Admin form reuses
  `LeaseCreatePage`, binds the current existing profile, and copies no old room,
  tariff, payment, evidence or identity file. Live browser verification remains
  pending.
- Backend behavior suite: 111 pass (`b46f3ab41ac5a90e`). Focused frontend contracts,
  correction forms and notices: 27 pass (`1533ac5ed063a4a1`); expanded operational
  copy coverage also passes after adding cancellation/restoration/successor code
  authorities. Admin typecheck and API build pass. Admin build passes
  (`c51bd69306307403`). These checks are not substitutes for full runtime and
  role/report/document projection verification.
- A read-only local catalogue lists 20 current typed file references, UUID-array
  references and JSON consumers. A second read after clone cleanup reports zero
  remaining H08 clone databases. Main ledger remains at 114. Catalogue evidence:
  `test/lease-revision/file-catalog.local-read.cjs`.
- Verified local storage deletion primitive has five passing behavioral tests,
  using only generated temporary evidence. It validates canonical identity,
  checksum, size, real directory paths and hard links; verifies absence; credits
  zero bytes for already-missing files; and treats an unavailable storage root as
  `retry_pending`, not deletion. No real uploaded file was deleted. The durable
  command, inventory UI, claims, retries and tombstones are now implemented;
  see the refreshed audit checkpoint below.

## Pause audit and bounded integration repairs (4 October)

The user's continuation is conditional on audit findings. This checkpoint is
not a feature-complete or deployment approval. No overall "all clear" is claimed.

### Scope and implementation size

- Two independent source reviews inspected specification compliance and
  mutation/cache/storage boundaries. They performed no edits, database actions,
  tests or browser reproduction. KOSTATION has no indexed graph project; exact
  source is the fallback, and negative findings remain bounded to inspected paths.
- Before these audit repairs, the scoped untracked inventory contained 41
  application files / 7,321 nonblank lines, 42 test files / 5,863 nonblank lines,
  six migrations / 666 nonblank lines, and this progress document. These counts
  exclude tracked diffs, unrelated skills, scratch files and backups; they are
  not the total repository change count or a measure of completion.
- The inspected modules fit the approved correction, cancellation, archive,
  restore/successor and physical file-purge domains. No unrelated production-code
  deletion was found in the bounded `apps/backend/packages/docs` deletion check.
  This does not prove every changed line is necessary or correct.
- The large scope is real: append-only finance/documents, room bindings,
  concurrency, recoverable commands and non-transactional physical deletion
  require more than a form edit. The elapsed time and token consumption are not
  themselves evidence of correctness, and this audit does not certify that the
  previous execution was efficient.

### Confirmed findings repaired at this checkpoint

1. The Admin proof parser duplicated the old evidence shape and omitted required
   availability fields. It now uses the existing canonical evidence parser.
2. W06 proof workspace referenced nonexistent `payment_proof_files.property_id`.
   The invalid junction condition was removed; proof, invoice and file property
   scoping remain. The real PostgreSQL query now executes against a W06-submitted
   resident claim, not just a mocked SQL substring.
3. A pending proof could exist with no `payments` row and be classified as
   `not_required`. Revision context now counts all proof history and reports
   pending claimed amounts separately from verified/pending payments. Such
   cancellation retains its invoice and reports `pending_review`; mode/sponsor
   changes remain blocked. Unsafe or missing financial facts fail closed.
4. Post-command refetch could erase confirmed success. Cancellation/restoration
   consumed previews are excluded from projection refresh, component identity is
   scope-stable, and background errors retain cached workspace state with a
   visible retry notice. A restored archive keeps **Lanjutkan koreksi data**.
   Linked onboarding catches synchronous and asynchronous refresh failures
   separately from its confirmed server result. Live UI proof remains pending.
5. Correction already had a shortened help reference; other unexpected H08
   errors did not. Reviewed notices now preserve a strictly validated eight-hex
   support reference even when wrapping an uncertain command. Raw messages,
   paths, payloads and full correlation IDs are not exposed. Business rejections
   keep their existing operational copy.

### Fresh executable evidence

- Backend behavior/regression suite: **171 pass**, zero failures/skips;
  `a1e183859172a596`.
- Admin focused context/form/archive/cache/notices suite: **29 pass**, zero
  failures/skips; `967d23fa620b3eaa`. Evidence/purge/restoration/successor contracts:
  **13 pass**, zero failures/skips; `4e4dec5c4b6035d7` (42 focused frontend tests
  across these two non-overlapping runs). Standard `tsx` failed to launch its esbuild
  child process; the existing native TypeScript test loader was used instead.
  The broader resident lease-hub suite did not load its `@/` alias in that loader
  (`8794f3f632abc2b6`); it is not counted as passing or claimed verified.
- API build and Admin typecheck pass after the repairs:
  `32c6bfa1f44c70d5`, `1e52a42bdca8f915`. Admin production build and live browser
  flows have not been reverified at this checkpoint.
- Fresh guarded disposable PostgreSQL proof: `e238a8053c97e536`. Official runner
  applies/replays 115–120, verifies exact checksums/sentinels, and proves rollback
  at each injected ledger-append failure. The actual W06 proof submission and
  proof workspace query pass; proof-only cancellation retains its invoice.
- Actual generated temporary-byte purge proves protected JSON references,
  stable review fingerprints, concurrent idempotent replay, changed-content
  refusal, offline uncertainty, selected retry, immutable tombstones,
  post-unlink database failure, attachment/purge lock races and unknown consumer
  refusal. Legacy metadata hiding does not prevent verified byte deletion and
  already-missing bytes contribute zero freed space.
- The proof confirms primary source fingerprints and ledger remain unchanged;
  the exact generated clone was removed. No real uploaded file, primary database
  migration, user service, production service, Git checkpoint or remote was changed.

### Open specification gaps and completion gates

1. **Preview impact completeness:** `lease-data-correction.service.ts`
   `toPreviewResponse` still lacks the explicit Owner-entitlement impact and
   affected-document validity inventory required by H08 lines 85–88. Generic
   document assurances are not a substitute for authoritative preview fields.
2. **Resident historical discovery:** W06 `myBilling` selects active leases or
   ended leases with exit documents. A cancelled archived lease without a
   successor can lose the portal list of historical receipts, despite individual
   receipt endpoints retaining resident-scoped authorization. Add an explicitly
   read-only history route/projection; do not revive payment mutation authority.
3. **Missing unclaimed bytes:** billing metadata still marks live/unclaimed
   files available, while `FileService.readContent` may return
   `FILE_CONTENT_NOT_FOUND`. Verified purge is already projected correctly;
   discovery of ordinary missing bytes must not keep offering a broken link or
   confuse unavailable storage with verified physical deletion.
4. **Runtime and release evidence:** current API/UI against an isolated clone,
   Admin/Owner/Resident scope, paid/sponsored pre/post check-in, failed background
   refresh, desktop/mobile/keyboard, changed ownership/tariff and room reuse,
   document/report projections, final builds and fresh requirement audit.

The approved scope remains intact. Do not silently downgrade these gates to
optional follow-ups, mark the goal complete, commit/push, or deploy this checkpoint.

## Completion matrix (full approved scope)

| Requirement | Current state | Required evidence before completion |
| --- | --- | --- |
| Domain relationships, state and authorization, review contracts | Context and scoped commands implemented; proof-only finance repaired | Complete Owner/document preview and historical read projections |
| Dedicated staged correction page reusing new-lease patterns | Wired with strict review/commit contracts; live browser proof pending | Paid/sponsored, pre/post check-in, desktop/mobile/keyboard and live UI |
| Room, tariff, period, mode, sponsor and fee-policy correction | Authorities implemented; mode and combined correction disposable proofs pass | Full role/document projections and live UI, financial/Owner guards |
| Cancel/archive, mistaken-activation confirmation, safe room release | Command, immutable archive, search/detail UI, atomic release and actual activation-only PostgreSQL proof implemented | Full runtime/role/report projection audit |
| Direct restore and linked successor | Scoped immutable commands, canonical linked onboarding and actual PostgreSQL rollback/concurrent-replay proof implemented | Full room reuse/distinct-room, changed ownership/tariff, role projections and live UI |
| Exclusive file inventory, purge and retries | Inventory/UI, durable claims/results/retries/tombstones implemented; actual DB/storage/concurrency proof passes | Live UI and all role/download projections, ordinary missing-byte discovery |
| Actionable toasts and persistent errors | Correction/cancellation mappings and UI implemented; runtime coverage pending | Each UI/action rejection, focus, pending, confirmation and success |
| History/activity and all role/report/document projections | Correction and cancellation activity added; cancellation actual SQL proved | Admin/Owner/Penghuni authorization and correct historical versus prospective reads |
| Additive migrations, official manifest and disposable DB proof | Migrations 115–120 clone apply/replay/rollback pass; primary DB remains unchanged | Current-ledger release preflight and full final invariants |
| Complete release and regression checks | Not complete | Builds, focused regressions, runtime UI, migration and full requirement audit |

## Next execution slice

Close the three explicit specification gaps above without expanding the feature
scope. Extend room reuse/distinct-room and changed commercial authority proofs.
Verify current API/UI through an
isolated clone rather than restarting the user's API or migrating the main DB.
Complete all role/report/document projections, desktop/mobile/keyboard checks,
and the final requirement audit. The full scope remains required, not optional
follow-ups or a smaller goal.

## Bounded continuation after the pause audit (4 October)

Status: **IN PROGRESS**, not deployment-ready. The user's instruction to
continue authorizes implementation and isolated verification, not commit,
push, a primary-database migration, a user-service restart or VPS deployment.
The earlier open-gap list above is a historical checkpoint. The following
evidence supersedes its three functional gaps without removing the remaining
full-scope completion gates.

### Functional gaps repaired

1. Correction preview now includes property-scoped, effective-date Owner
   entitlement/management-fee comparisons and an affected invoice, receipt and
   paid-contract-confirmation inventory. Sponsored residence keeps rental
   entitlement at zero. Existing transfers never change. Stored receipt facts
   remain historical; invalidated documents remain invalidated. The strict
   Admin contract and staged review display the authoritative fields. Invalid
   amounts fail closed with reviewed, actionable Indonesian UI copy.
2. Resident billing adds independently discoverable account-scoped cancelled/
   ended lease history and an explicit historical detail read. Current
   successor invoices and claims remain separate. Actual server `v4` policy,
   sponsored-residence and reversal fields are understood by the strict
   Penghuni parser. Cancellation never grants payment mutation authority.
3. Authorized file reads distinguish inaccessible storage (503, no absence
   fact) from confirmed ordinary missing bytes (404, metadata availability
   observation only). Projection then removes the broken link without a purge
   tombstone or freed-byte claim. A successful later read clears the absence
   observation. Durable purge claims still take precedence over availability.
4. Resident evidence now has a dedicated relationship-authorized content route.
   An Admin-uploaded payment proof is readable only when attached to the
   authenticated resident's selected lease. Admin/Owner cannot use this self
   route, nor can another account/lease obtain the file. This does not relax
   general FileService uploader/property authorization. Purged/pending/missing
   evidence retains metadata with an explanation and no active content link.
   The ordinary download filename is derived from the existing billing context,
   not an opaque file identifier. Available evidence uses the existing shared
   authenticated preview/download component.

### Fresh checks and failures that informed repairs

- Earlier fresh backend run: **193 pass**, zero failures/skips. After the
  resident evidence addition, the behavior-only run has **167 pass**; the
  original correction/check-in regressions must still be included in the final
  aggregate run. Do not add these overlapping runs together.
- Original Admin contract/form/cache/archive/purge/restoration/successor tests
  plus resident history/parser checks: **57 pass**, zero failures/skips in the
  latest focused run (43 Admin and 14 resident tests). The native TypeScript
  loader executes the original test modules. Its `import.meta.url` mapping
  retains the original filename for `.test.ts`; no assertions are bypassed.
- Actual cloned PostgreSQL caught a nonexistent proof occupancy column and a
  Penghuni `v4` parser mismatch. Both were repaired and rerun, not hidden by a
  mock or omitted fixture. The legacy null-lease proof fallback uses the
  invoice's occupancy and resident/lease/property relationships.
- The fresh `--disposable-local-only --proof=files` run passes the official
  115–120 apply/replay/checksum/sentinel/DDL rollback checks, W06 claim/workspace
  SQL, cancellation, the real Admin preview parser, the real Penghuni history/
  evidence parser, generated-byte content reads and all existing purge races.
  Admin-uploaded historical evidence content and filename pass; cross-account,
  cross-lease and non-resident roles are denied before storage access.
- Earlier fresh restoration/successor clone run passes canonical onboarding,
  atomic single replacement, unchanged old finance/invoices, independently
  discoverable same-account current/history reads and concurrent replay.
- API build, Admin typecheck/production build and Penghuni typecheck/production
  build passed during this continuation. The evidence UI addition has a fresh
  Penghuni typecheck and API build; final production builds must be rerun.
- Disposable proof confirms the primary source fingerprints/ledger unchanged
  and removes only its exact generated clone. Storage proofs remove only
  generated temporary bytes. No real uploaded file was deleted.

### Remaining gates (not optional)

- Real API/UI runtime, authenticated Admin/Owner/Penghuni, desktop/mobile/
  keyboard, actionable notices, failed background refresh and scoped caches.
- Complete room-reuse/distinct-room and changed ownership/tariff restoration
  evidence; full document/report/role projection audit.
- Current final aggregate regressions/builds, migration release preflight and
  final requirement audit against the full approved H08 plan.

The guarded runtime opt-in uses a cloned database, generated temporary storage,
an isolated Redis key namespace, random unused loopback ports and real
application/JWT guards. Outbound integrations and lease schedulers are disabled.
It does not substitute a fixture HTTP bridge for the application. Runtime
success is not claimed until the browser checks actually execute.

## Runtime findings and projection audit (5 October)

Status remains **IN PROGRESS**. No commit, push, primary-database migration,
user-service restart or deployment has been performed.

- Actual mobile Admin correction exposed a committed save whose HTTP response
  was rejected by the strict client. Correction/cancellation controllers now
  return the documented `{ data: ... }` envelope. Four controller-to-client
  regression cases failed before the fix and pass after it. Real authenticated
  correction HTTP first-save/replay returns 201/200 with one correction ID.
  The mobile staged form subsequently showed successful save and persisted
  before/after history; keyboard confirmation and mandatory reason were checked.
- A reduced unpaid rental was wrongly projected as an initial payment: a
  12-to-6-month correction yielded Rp10,500,000 apparent credit and Rp600,000
  outstanding instead of Rp0 paid and Rp11,100,000 outstanding. Actual cloned
  SQL reproduced this. W06 excludes only the recorded price-reduction credits
  when applying the already-corrected contract value, retaining genuine credits.
- The same regression was independently reproduced in the resident list/notice
  view. New append-only migration **121_lease_revision_financial_projection.sql**
  replaces that read view; migration 114 and all historical invoices remain
  unchanged. The official runner applies/replays 115–121 and verifies rollback
  of the view replacement if ledger insertion fails. The new financial assertion
  passes; additional Owner projection checks are still being completed.
- Actual Owner not-eligible SQL failed with an out-of-scope `check_in` alias.
  Lifecycle/occupancy joins now live at the query scope that uses them. Owner
  realization ledger projection likewise distinguishes correction credits from
  verified money. The pending-service Owner serializer also supplied numeric
  zero to a strict string-money parser; it now supplies canonical `'0'`.
- The complete latest behavior/original-regression aggregate has **200 pass**,
  zero failures/skips. This count overlaps earlier runs and is not additive.
- Fresh actual restoration/successor SQL passes canonical room reuse, changed
  tariff, changed sponsored Owner, no-money paid/sponsored/activation-only
  restoration, concurrent retries, atomic rollback and distinct replacement room
  history. Conflict setup is rolled back. Main source/ledger fingerprints were
  unchanged and the exact generated clone was removed.
- Actual resident historical billing remained distinct from its successor.
  Missing-byte download now refetches authoritative availability after reporting
  the actionable error, removing the broken button without claiming a purge.

Remaining: final Owner/report/document projections and guarded real UI
cancellation/restoration/file-inventory checks, final fresh builds/regressions,
and the complete approved-plan release audit. No deployment-ready claim yet.

### Follow-up runtime and earning authority findings

- Actual authenticated Admin UI cancellation and direct restoration both
  succeeded against the isolated clone. Mandatory reasons, confirmation default
  focus on Cancel, pending controls, mobile rendering, preserved history and room
  reservation/release were checked. Audit timestamps now display their Jakarta
  date/time instead of an em dash; two focused timestamp tests pass.
- Archive file inventory and irreversible confirmation were exercised without
  executing the irreversible browser action. Cancel dismissed the confirmation;
  the file remained present. Physical deletion is covered separately by the
  guarded generated-byte/storage/database proofs, not by deleting real uploads.
- Owner dashboard and collection progress loaded through the actual Owner JWT.
  The Owner finance page initially failed. Real cloned SQL traced this to five
  historical invoice allocations whose room differed from the current lease/
  occupancy room. Existing migration 072 selected those candidates even though
  its insertion validator rejected them.
- New append-only migration **122_owner_earning_candidate_authority.sql** narrows
  candidates to the existing validator's property/lease/resident/room/occupancy
  authority. It does not weaken the validator, rewrite recorded earnings, alter
  financial transactions, or backfill data at deployment. The official runner
  verifies its checksum, sentinels, DDL/ledger failure rollback and replay.
- The first 115–122 clone run passed Owner finance, immutable financial facts and
  all cancellation assertions. A stronger valid-money recognition fixture then
  exposed a separate pre-check-in duration-correction schedule reconciliation
  failure. The check-in schedule query now excludes void installments and only
  subtracts recorded price-reduction credits, not verified cash or other credit.
  The stronger proof now passes: corrected physical check-in succeeds, a valid
  canonical payment produces Owner earning records, recognition replay inserts
  zero duplicate rows, and original financial facts/room-history earnings remain
  unchanged. The primary source/ledger is unchanged and the clone was removed.
- Latest aggregate command includes original frontend suites as well as behavior
  and original correction/check-in suites: **245 pass**, zero failures/skips.
  This overlaps the earlier 200-test run; counts are not additive. API build,
  Admin typecheck and Admin production build passed. A subsequent API build and
  aggregate rerun include the check-in schedule adjustment.
- Each finished clone run removed its exact generated database. The first real
  API/UI test runtime has been closed, including its own processes, isolated
  Redis namespace and generated storage. The primary data/ledger were unchanged.

The following continuation supersedes this remaining-check list. No production
operation or deployment-ready claim has been made.

### Corrected schedules and effective Owner coverage (5 October)

- Real Owner finance UI now loads through its normal Owner account, including
  a desktop dark-mode check. The same account is denied the Admin archive API.
  PDF/XLSX export is verified through the actual scoped service SQL and binary
  renderers, including filenames and unchanged transaction fingerprints.
  Browser download/preview capture remains unverified; it is not counted as a
  passing UI export test.
- Failed background refresh was exercised in the real Admin cancellation form.
  Only the isolated test API was stopped. The persistent operational notice,
  toast and incident code appeared; the typed reason and prior review remained
  intact. Restarting that isolated API and using the offered retry removed the
  notice and retained the exact draft. Mobile 390 x 844 rendering was checked.
- A stronger canonical fixture exposed check-in rejection after an annual term
  reduction followed by an extension: the immutable original invoice plus the
  journal-authorized additional invoice did not match the rebuilt row count.
  A focused service regression failed before the fix. The service now reconciles
  safe net obligations against the corrected contract, verifies amendment
  provenance and routine-period uniqueness, and versions only effective dates.
  Wrong totals, unsafe money and unrecorded routine duplicates still reject
  before any period write. No invoice, installment amount or payment is rewritten.
- The same scenario on monthly/two-month installments exposed collisions with
  the routine cycle uniqueness indexes. New migration
  **124_journal_authorized_correction_charges.sql** distinguishes an additional
  charge with an immutable correction FK, exact amount/property/lease validation
  and a one-charge-per-amendment index. Routine period uniqueness is retained.
  The invoice exemption requires an authoritative matching installment/journal;
  a fingerprint prefix alone cannot authorize a fabricated invoice.
- Paying the additional invoice after check-in exposed Owner recognition still
  reading the original future invoice coverage. New migration
  **123_owner_earning_effective_service_period.sql** supplies a shared effective
  period read for both recognition and its insertion validator. It reads only
  the already-authorized latest service-period version, falls back to original
  invoice coverage for legacy records, and retains property/resident/room,
  payment, ownership, policy, reversal and coverage checks. It performs no
  backfill or rewrite of recognized earnings or financial records.
- The official cloned runner applies/replays **115–124**, checks their raw
  checksums/sentinels and injects ledger failures for rollback. For 123 the view
  and both function replacements roll back together. For 124 the FK column and
  replacement index predicates roll back together. Source data/ledger remain
  unchanged; only the exact generated clone is removed.
- The annual, monthly and two-month correction/check-in paths pass real cloned
  PostgreSQL. Valid current-room money is still recognized, recognition replay
  inserts zero duplicate rows, old-room earning records and financial facts are
   unchanged, and actual Owner PDF/XLSX documents are valid. The final fresh
   full-scope run now passes; its evidence is recorded below.
- Latest aggregate: **255 pass**, zero failures/skips;
  seven focused schedule tests pass separately (overlapping, not additive).
   API production build passes. Focused lint found an obsolete unused commercial
   row type after resolver reuse; the unused type was removed and focused lint passes.

### Final SQL, report and generated-storage acceptance (5 October)

- Default disposable command exits **0** on the current 115–124 migrations:
  `26e0a45e2bb33e7e`. It covers actual pre/post-check-in room/sponsor/mode
  correction, the W06 payment race, additive-charge authority, corrected annual/
  monthly/two-month check-in and later date amendments, cancellation, direct
  restoration and a distinct-room linked successor. Immutable financial facts,
  current-versus-historical resident reads, scoped Owner PDF/XLSX generation,
  rollback, replay and source-database/ledger preservation pass. The exact
  generated clone is removed at completion.
- Generated-byte file proof exits **0**: `ba3f25d2bc76b35b`. Coverage guards,
  private historical evidence, shared-file protection, concurrent replay,
  checksum changes, offline uncertainty, partial results, selected retry,
  immutable tombstones, post-unlink database failure and attachment races pass.
  An unknown future file consumer disables selection rather than permitting
  deletion. Only generated temporary bytes are removed; primary fingerprints
  and the primary ledger remain unchanged. The fresh run after test isolation
  also exits 0 with the same content-addressed evidence archive.
- A default lease report originally included cancelled erroneous contracts.
  The regression failed before the fix. Default rows and contract totals now
  exclude cancelled leases; explicitly requesting `cancelled` keeps historical
  rows readable. Cash/payment reports are unchanged. Three behavior cases plus
  the actual scoped PostgreSQL report pass. The fixture uses a one-day report
  period; the existing maximum report-range validation was not weakened.
- A test-only integration failure was traced to the new installment matrix
  reusing archived rooms, then exhausting rooms for the linked-successor proof.
  Each matrix case now runs against a real PostgreSQL transaction and rolls
  back after all assertions, preserving the other scenario's room stock.
  Restoration conflicts were correct rejections; no application room guard
  was loosened. The fresh complete default proof passes with this isolation.
- Current aggregate `2c0cc28c6af67d46`: **255 pass / 0 fail / 0 skip**. This
  overlaps earlier counts and is not additive. API build
  `32c6bfa1f44c70d5`, focused lint `8d7bf9416dc3636f` and owned-path whitespace
  checks pass. Earlier current Admin/Penghuni typechecks and production builds
  remain applicable because their source has not changed in this final slice.

### Requirement-to-evidence boundary

| Approved requirement | Current authoritative evidence |
| --- | --- |
| Staged correction, reasons, before/after history, no roomless occupancy | Actual Admin mobile save/history, strict controller/client tests, default PostgreSQL correction matrix and room/evidence rollback |
| Paid/sponsored modes and sponsor/payer/waived policy, safe money impact | Actual mode and policy commands, effective policy versions, immutable charge/credit authority and W06 payment race |
| Mistaken lease cancellation, separate from real checkout | Real occupied rejection, activation-only confirmation, atomic release/archive, retained pending finance and actual Admin cancellation UI |
| Searchable/readable archive and safe restoration or linked replacement | Scoped archive SQL/client contracts, actual restoration UI, room/Owner/tariff conflicts, default restore/successor proof and independent resident history |
| Exclusive physical-file purge with partial/unknown results and retry | Actual generated storage/DB proof, protected/shared evidence, durable claims and tombstones, attachment races, inventory/confirmation UI cancellation |
| Operational notices, keyboard/mobile, retry and cache safety | Mandatory reason/default Cancel focus, actual failed-refresh/recovery UI, draft preservation and scoped cache contract tests |
| Owner/resident/report/document consistency and preserved history | Actual account-scoped SQL/strict parsers, valid Owner PDF/XLSX bytes and filenames, report archive boundary, unchanged recorded financial fingerprints |
| Additive migrations, build and rollback | Official 115–124 runner, checksum/sentinels, replay 0, injected DDL/ledger rollback, current API/Admin/Penghuni builds |

This table records local evidence, not production acceptance. The browser checks
verify the real Owner dashboard, expandable realization details and finance page.
They do not verify the operating-system save of a PDF/Excel file. The real
authenticated HTTP delivery proof below closes the endpoint/document contract
check without claiming that the browser's download capture succeeded.

### Final guarded HTTP/document and cleanup evidence

- Current real-runtime proof `aa2c6078e1576b65` exits 0. The Owner dashboard,
  realization detail expansion and finance page load through the actual Owner
  login. Correction first-save/replay and Owner/Admin role separation pass.
  Its generated API/UI processes, Redis namespace and temporary storage are
  closed gracefully. Primary source/ledger fingerprints match and its exact
  clone is removed.
- Native browser download events timed out for dashboard PDF/Excel and finance
  XLSX, with no new export error surfaced and no preview tab discovered. No
  saved browser file is claimed. Do not infer from this alone either successful
  saving or an application defect. Browser policy was not bypassed and the
  unknown user-owned tab was preserved.
- `--disposable-local-only --proof=http` exits 0: `3b0c627202db3c8d`.
  It starts the actual API on a fresh loopback port against a migrated clone,
  signs in with the normal Admin/Owner password/JWT flow and tests all four
  report/progress PDF/XLSX exports. Unauthenticated requests return 401; Owner
  requests return 200 with private/no-store headers, the canonical MIME type,
  a non-UUID filename containing the selected month, and valid `%PDF`/`PK` bytes.
  Filename parsing uses the actual shared download client. This is not a stubbed
  HTTP bridge. All commands, processes, generated cache/storage and the exact
  clone are cleaned; primary data and ledger remain unchanged.
- One earlier compressed-CLI runtime attempt was terminated by that wrapper's
  execution limit before UI readiness. Cleanup of that particular clone was
  not observed and its exact identity was not emitted. No unidentified database
  was deleted by pattern. Later proofs use the tool's background job lifecycle
  and an exact generated finish signal with observed cleanup. This limitation
  does not invalidate the primary-data preservation or later successful proofs.

### Release boundary and required deployment preflight

- Fresh read-only local preflight passes:
  `node test/lease-revision/release-preflight.local-read.cjs --local-read-only`.
  It verifies all 123 source checksums and the local ledger's exact canonical/
  historical alias checksums. Five historical aliases match the official runner;
  no aliases are rewritten. The ledger has 114 rows, ends at migration 114, and
  exactly migrations 115–124 remain pending. A fresh read outside the transaction
  observes the same ledger; mutations are zero. PostgreSQL read-only mode is
  enforced on the connection. This is a local checkpoint check, not permission
  to migrate and not a substitute for the official runner's target preflight.
- The approved H08 code scope is implemented, with no further source gap found
  in the final requirement review. The user-confirmed manual save below closes
  the outstanding local acceptance gate. Generated document bytes and guarded
  HTTP delivery remain separate evidence. No production acceptance or universal
  browser compatibility is claimed.
- Before any deployment, recheck the real target ledger/checksums, take a backup,
  coordinate the correction write window, apply the official runner and deploy
  matching API/Admin/Penghuni builds. Migration 124 requires the new API's journal
  link when issuing an additional correction charge; do not leave an older API
  accepting correction writes during this migration/build switch.
- VPS/production migration or restart, commit and push remain outside current
  authority. The approved local execution status is recorded below. Existing
  unrelated skill changes and scratch/backup files are preserved and not staged.

### Approved local release and final manual acceptance

- The user explicitly approved local backup, migrations 115–124 and API restart
  for final verification. This is not permission to weaken terminal security or
  deploy to the VPS.
- Backup: `backups/h08-pre-115-2026-10-05T04-31-18-970Z-7b043b3b.dump`.
  It contains 75,123,093 bytes; custom `PGDMP` header and `pg_restore --list`
  succeed with 1,740 catalog entries. SHA-256:
  `5ee0d03ec3ef17a96c53e40457f55237e736411085197a8c7a9440088ca6f4db`.
  No database restore was performed. The backup is retained for the local
  migration; no existing backup was overwritten or deleted.
- API, Admin and Penghuni production builds completed before the local switch.
  The attempted agent stop was blocked before execution. The user subsequently
  stopped the old API; the actual port check and guarded migration entry point
  both verified that port 3000 was not accepting connections. No terminal
  allowlist/security change or substitute stop mechanism was used.
- `npm run db:migrate` failed before SQL execution because the local tsx/esbuild
  subprocess could not start (`spawn UNKNOWN`). The freshly built official
  `runMigrations` was then called through `local-migrate-approved.cjs`, using
  canonical source SQL because Nest does not copy those files into `dist`.
  The entry point verifies local-only configuration, the backup SHA, stopped
  API and migration-114 starting ledger; it is not a manual ledger/schema fix.
- Official runner result: `applied=10`, `baselined=0`, `alreadyApplied=113`.
  Physical ledger: 124 rows, latest `124_journal_authorized_correction_charges.sql`.
  The historical removed migration row explains the physical/source count
  difference. Existing accepted aliases and checksums were not rewritten.
- Before/after migration fingerprints are identical for all 11 inspected tables:
  residents, leases, rooms, occupancies, onboarding commitments, booking holds,
  payments, invoices, payment receipts, sponsored terms and Owner realizations.
  This is bounded evidence for those tables, not a database-wide equality claim.
- Matching `npm run start` runs as agent job `shell_63f6d3e3bfbdb9f1` with a
  one-hour lifetime. Listener `127.0.0.1:3000` is PID 8964. The actual local Admin
  report authenticated and loaded current data after restart. No HTTP health
  status is claimed: the separate PowerShell probe was denied and not rerouted.
  This temporary agent process is not a durable user-managed service; inspect
  the listener before starting another API, and use the normal API terminal once
  the temporary process ends.
- The agent's PDF download event again timed out without a surfaced export error
  or new preview tab. The user then explicitly confirmed that local Admin Owner
  report PDF and Excel files both saved and opened successfully, in response to
  the requested non-UUID filename check. This closes the local manual acceptance
  gate without misrepresenting automatic browser capture or separate Owner saves.
- Source changes were not committed or pushed. VPS/production is unchanged.
