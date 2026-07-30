# KMO API and Integration Contract

Status: **APPROVED PLANNING — NOT IMPLEMENTED**

Program code: `KMO`

Recorded: 2026-07-30 (Asia/Jakarta)

## 1. Purpose

This document defines the target NestJS API, command/query boundaries,
authorization order, validation, envelopes, pagination, idempotency,
transactions, locking, audit/outbox behavior, TanStack Query invalidation, file
mediation, and disabled/manual integration adapters for the ecosystem overhaul.

The base URL remains `/api/v1`. Existing live routes are extended or versioned;
parallel controllers with duplicate routes are prohibited.

## 2. API-Wide Invariants

| ID                 | Contract                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INV-PROPERTY-001` | A record from one property/building scope cannot be read, counted, cached, exported, mutated, or linked through another scope.                                  |
| `INV-OWNER-001`    | Property Owner reads intersect only active building assignments at the record's effective time.                                                                 |
| `INV-RESIDENT-001` | One person has one canonical resident identity per property context; duplicate email, phone, or NIK conflicts fail closed.                                      |
| `INV-LEASE-001`    | Final activation uses the committed account authority and is atomic across resident, lease, room, occupancy, billing, lead/hold, audit, and outbox authorities. |
| `INV-BILLING-001`  | Invoice totals derive from an immutable lease commercial snapshot; category price edits never rewrite history.                                                  |
| `INV-PAYMENT-001`  | Payment amount reconciles to explicit allocations; no allocation can exceed current invoice outstanding.                                                        |
| `INV-REPORT-001`   | Preview and export use one server query authority, normalized filter, authorization scope, record set, and totals.                                              |
| `NFR-REL-001`      | All externally retryable commands require a stable `Idempotency-Key`.                                                                                           |
| `NFR-PRIV-001`     | Responses and caches use explicit whitelists; raw rows, metadata, paths, credentials, and provider payloads are forbidden.                                      |
| `NFR-OBS-001`      | Correlation ID propagates through request, audit, idempotency, outbox, worker, and export evidence.                                                             |

## 3. Versioning, Media Types, and Envelopes

### 3.1 Versioning

- Route prefix stays `/api/v1`.
- Admin overhaul reads/writes use:
  `Accept: application/vnd.granada.admin-ux.v2+json`.
- Controllers with legacy behavior dispatch by exact media type inside the one
  registered live controller. Registering a second controller on the same route
  is prohibited.
- Public and Penghuni routes can adopt exact envelopes without the Admin media
  type only when their existing consumers migrate in the same vertical slice.
- A breaking field removal requires a new media type or route version; adding an
  undocumented key to an exact envelope is also treated as breaking.

### 3.2 Success envelopes

Single resource or command:

```json
{
  "data": {}
}
```

Nullable resource:

```json
{
  "data": null
}
```

List:

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "limit": 20,
    "offset": 0
  }
}
```

Rules:

- `data` and `meta` are exact; top-level metadata leakage is prohibited.
- `total` is authoritative for the full normalized scope, including an empty or
  out-of-range page.
- default `limit=20`, range `1..100`; default `offset=0`, minimum `0`.
- stable ordering always has a domain sort plus UUID tie-breaker.
- an out-of-range offset returns `200`, `data: []`, and unchanged `total`.
- exports do not use list pagination, but use the same filter/sort snapshot.

### 3.3 Error envelope

New V2 endpoints return:

```json
{
  "error": {
    "code": "DOMAIN_CODE",
    "message": "Safe recovery message",
    "field_errors": {}
  },
  "correlation_id": "opaque-correlation-id"
}
```

- `field_errors` is optional and contains safe field names/messages only.
- stack, SQL, table/column, path, token, raw provider response, and PII are never
  returned.
- a client must preserve recognized backend `code` and safe `message`; it must
  not reinterpret a domain denial as success.

Canonical HTTP use:

| Status      | Meaning                                                                            |
| ----------- | ---------------------------------------------------------------------------------- |
| `200`       | Successful read, update, release, verify, reverse, or replay of an original `200`. |
| `201`       | New resource/command result, including replay of an original `201`.                |
| `400`       | Malformed shape/value or invalid filter.                                           |
| `401`       | Missing/invalid authentication.                                                    |
| `403`       | Role/permission/scope/rollout denial.                                              |
| `404`       | Resource absent inside the already-authorized scope.                               |
| `409`       | Lifecycle, duplicate, conflict, ambiguity, or idempotency reuse.                   |
| `413`/`415` | File size/type rejection.                                                          |
| `422`       | Business validation requiring field correction.                                    |

## 4. Input Validation

### 4.1 DTO rules

- JSON and query keys use `snake_case`; response wire uses `snake_case`.
- DTOs use whitelist and forbid non-whitelisted fields.
- UUID route/query fields are UUID v4.
- Dates are exact `YYYY-MM-DD`; timestamps are canonical ISO-8601.
- Monetary amounts are positive integer rupiah in safe JavaScript range on the
  wire and `BIGINT` in PostgreSQL.
- Boolean query values accept only actual boolean or exact strings
  `"true"`/`"false"` when a query transform is explicitly defined. Truthy
  coercion is prohibited.
- Strings are trimmed and bounded. Whitespace-only values fail validation.
- Indonesian phone values normalize on the server; email normalizes
  case-insensitively.
- `null` is accepted only where the wire contract explicitly permits clearing.
- Effective-empty PATCH bodies are rejected.
- File upload DTO and multipart file are jointly validated.

### 4.2 Client parser rules

Admin and Penghuni clients:

- parse `unknown`, not trusted generated types;
- reject missing and extra keys, invalid enum, UUID, timestamp, date, and
  nullability;
- copy a whitelist into cache rather than caching the transport object;
- never retain KTP/NIK, file paths, signed URLs, tokens, or form PII in query
  keys;
- reset or isolate draft and mutation results when account, property, resident,
  room, lead, lease, or building scope changes.

## 5. Authentication, Authorization, and Scope

### 5.1 Required order

Every protected command must execute:

1. authenticate;
2. verify exact role;
3. verify all required permissions;
4. resolve active property or resident context;
5. resolve Property Owner active building assignments when applicable;
6. reject empty/cross-scope access;
7. verify feature rollout for commands gated by rollout;
8. claim idempotency;
9. enter the domain transaction and lock/revalidate;
10. mutate, audit, and write outbox.

Authorization must finish before a resource lookup that could disclose
existence. A transaction rechecks property/building ownership for state that can
change concurrently.

### 5.2 Role boundaries

- `owner`: global operational authority defined by existing RBAC.
- `manager`: assigned-property operational authority.
- `admin`: assigned operational authority limited by explicit permissions.
- `resident`: authenticated self-service only.
- `property_owner`: investor experience, read-only and building-scoped.

`property_owner` must not inherit global `owner` behavior. The backend filters
room, resident summary, lease, payment summary, vehicle, complaint, notification,
and report reads by active building ownership.

### 5.3 Account provisioning

Per `DEC-RESIDENT-005` and `DEC-OWNER-003`, resident and Property Owner accounts
are provisioned by their domain commands, not generic public user creation.

- Login accepts normalized email or phone plus password.
- A resident account is created or linked atomically during successful
  **Commit Onboarding**, after conflict checks. A future-start resident remains
  `pending_activation` with an `awaiting_activation` lease and no occupancy
  until **Activate Lease** succeeds.
- A Property Owner account is created or linked atomically during building
  assignment.
- Temporary passwords are generated server-side and returned once only in a
  dedicated authorized receipt envelope with `Cache-Control: no-store` and
  `Pragma: no-cache`. The receipt is never replayable. Plaintext is never stored,
  audited, logged, placed in outbox/telemetry/URL/export, or returned by ordinary
  read/command envelopes. The account sets `must_change_password = true`.
- If normalized email and phone resolve to different users, the command fails
  `IDENTITY_CONFLICT`.
- Reusing an existing matching account adds only the required scoped role and
  link.
- Password reset is a dedicated audited command.

The secret-bearing response fragment is an explicit exception to ordinary
resource serialization and exists only inside the successful provisioning/reset
command response:

```json
{
  "credential_receipt": {
    "status": "issued",
    "login_identifier": "normalized-email-or-phone",
    "temporary_password": "server-generated-once"
  }
}
```

The fragment is nested beside that command's exact safe business result under
`data`, is consumed from mutation memory only, and is never written to TanStack
Query cache, browser storage, toast, telemetry, or error evidence. Reusing the
same idempotency key returns the stored safe business result with
`credential_receipt.status = "already_issued"` and
`temporary_password = null`; it never regenerates or replays plaintext. Losing
the receipt requires the dedicated audited reset-password command.

## 6. Idempotency Contract

All create, transition, financial, assignment, upload-link, reminder-record, and
export commands require `Idempotency-Key` of 16–128 characters.

Identity tuple:

`actor_user_id + canonical route/command + idempotency_key`

Behavior:

- request payload is canonicalized and hashed with relevant property/resource
  scope;
- same key and fingerprint returns the exact stored safe status/envelope;
- for a secret-issuing command, the transient plaintext receipt is excluded from
  the stored replay snapshot; replay returns the same safe business result plus
  the explicit `already_issued` receipt state defined in 5.3;
- same key with a different fingerprint returns
  `409 IDEMPOTENCY_KEY_REUSED`;
- pending claim returns `409 COMMAND_IN_PROGRESS`, not a second mutation;
- claim, command result, and safe replay body use the same transaction where
  domain locking permits;
- failed validation/authorization before claim is not persisted as command
  success;
- a response snapshot contains only the endpoint whitelist;
- keys remain stable for a logical retry and rotate when payload, target, or
  scope changes;
- UI double-submit guards supplement, but never replace, server idempotency.

## 7. Transaction, Lock, Audit, and Outbox Contract

### 7.1 Transaction boundary

Use the existing `DatabaseService.transaction()` and propagate its `PoolClient`
through every repository call. A transaction must not fall back to the pool.
Rollback failure must not mask the original error; the client releases exactly
once.

### 7.2 Locking rules

- Lock order is deterministic and documented per command.
- Property-scoped advisory transaction locks serialize property-wide code
  allocation and workflows that span unrelated rows.
- Lock parent authority before children: property/building, lead/resident,
  room/lease, invoice/payment, then dependent histories.
- Workers first select deterministic property scopes, acquire advisory locks,
  then use bounded `FOR UPDATE SKIP LOCKED`.
- All eligibility checks that affect mutation are repeated on locked state.
- Lock waits and deadlocks must fail safely and leave no partial lifecycle or
  financial result.

Canonical orders:

| Command                     | Lock order                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Lead hold                   | property advisory → property → lead → room → related active holds                                    |
| Lead onboarding commit      | property advisory → lead → hold → room → resident/user identity → awaiting lease → invoices          |
| Direct onboarding commit    | property advisory → normalized user identity → resident → room → awaiting lease → invoices           |
| Lease activation            | property advisory → resident → awaiting lease → reserved room → activation prerequisites → occupancy |
| Lease transfer              | property advisory → resident → source lease/occupancy → source room → target room → invoices/deposit |
| Payment verify              | property advisory → payment/proof → selected invoices in stable order → allocations → receipt        |
| Payment reverse             | property advisory → payment → reversal → allocations/invoices in stable order                        |
| Expense approve/pay/reverse | property advisory → expense → approval/evidence → payment/reversal                                   |

### 7.3 Audit

Domain audit actions use stable dotted names, for example:

- `resident.account_provisioned`;
- `booking_lead.onboarding_committed`, `booking_lead.leased`;
- `lease.activated`, `lease.transferred`, `lease.completed`;
- `payment.verified`, `payment.reversed`;
- `security_deposit.collected`, `security_deposit.refunded`;
- `expense.approved`, `expense.paid`, `expense.reversed`;
- `reminder.whatsapp_opened`, `reminder.sent_manually`;
- `building_owner.assigned`, `building_owner.ended`.

Audit snapshots contain IDs, state, safe amount/date/status fields, and reason
codes only. They exclude full resident form data, phone/email, NIK, file path,
credentials, rendered reminder recipient, and provider payload.

### 7.4 Outbox

`business_events` is written in the same transaction. Event keys are unique and
deterministic by aggregate transition. Examples:

- `booking_lead.onboarding_committed.v1`, `booking_lead.leased.v1`;
- `lease.activated.v1`;
- `invoice.issued.v1`;
- `payment.verified.v1`;
- `payment.reversed.v1`;
- `expense.paid.v1`;
- `reminder.recorded.v1`.

Payloads contain property/resource IDs, version, safe status/amount/date facts,
and correlation ID. Dispatch failure cannot roll back an already committed
domain command; the outbox worker retries later.

## 8. Canonical Query and Command Families

The following are target families. Existing compatible endpoints remain and are
adapted in vertical slices.

### 8.1 Property, content, and public catalog

| Method and route                       | Purpose                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `GET /properties/:propertyId`          | Property profile/settings for authorized Admin.                    |
| `PATCH /properties/:propertyId`        | Minimal profile update.                                            |
| `GET/PATCH /kost-types/:id`            | Category commercial/configuration authority.                       |
| `GET/PATCH /kost-types/:id/facilities` | Exact category facility set.                                       |
| `GET/PATCH /kost-types/:id/gallery`    | Ordered category gallery and cover.                                |
| `GET /property-policies`               | Published terms/rules.                                             |
| `POST /property-policies/versions`     | Create a new draft policy version.                                 |
| `POST /property-policies/:id/publish`  | Publish immutable policy version.                                  |
| `GET /public/hunian-catalog`           | Public category listing; no login.                                 |
| `GET /public/hunian-catalog/:slug`     | Category detail, gallery, facilities, rules, availability summary. |

The public catalog never returns exact vacant room IDs/numbers as a booking
choice. It returns category/gender availability and promotional content.

### 8.2 Rooms

| Method and route          | Purpose                                                                          |
| ------------------------- | -------------------------------------------------------------------------------- |
| `GET /rooms`              | Search/filter by property, category, building, status, gender, room number.      |
| `GET /rooms/:roomId`      | Full Admin room detail with summarized linked domains.                           |
| `PATCH /rooms/:roomId`    | Approved physical/nonstructural edit; lifecycle-active structural fields locked. |
| `GET /rooms/availability` | Property/category/gender/status aggregates.                                      |
| `GET /rooms/buildings`    | Authoritative building references.                                               |

`POST /rooms` remains disabled by rollout and absent from Admin UI because the
inventory is fixed at 163. `DELETE /rooms/:id` is prohibited.

### 8.3 Booking leads and holds

| Method and route                           | Purpose                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `POST /public/booking-leads`               | Compact public interest form, rate-limited.                                                               |
| `POST /booking-leads`                      | Admin quick-entry lead.                                                                                   |
| `GET /booking-leads`                       | Property-scoped Admin list.                                                                               |
| `GET /booking-leads/:leadId`               | Full lead detail and lifecycle authority.                                                                 |
| `PATCH /booking-leads/:leadId/status`      | Explicit non-conversion status transition.                                                                |
| `POST /booking-leads/:leadId/hold`         | Create/select exact 24-hour room hold.                                                                    |
| `POST /booking-leads/:leadId/hold/release` | Release active hold.                                                                                      |
| `POST /booking-leads/:leadId/convert`      | Commit account, pending resident, awaiting lease, financial obligations, and room reservation atomically. |
| `GET /booking-lead-holds`                  | Complete property-scoped hold coverage.                                                                   |

Public creation accepts category and gender, never room. Admin quick entry may
start from an exact vacant room. Conversion request contains resident completion
data, lease dates/plan, held room, verified DP payment, verified
security-deposit payment, and signed-contract confirmation. Server-derived
category/building/gender/rate are not accepted from the client. Conversion leaves
the lead `onboarding` and the lease `awaiting_activation`; only successful
`POST /leases/:leaseId/activate` writes `leased_at`, opens occupancy, marks the
room occupied, and makes the lead `leased`.

### 8.4 Residents and accounts

| Method and route                                     | Purpose                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `GET /residents`                                     | Property-scoped lease-oriented list and expiry filter.        |
| `GET /residents/:residentId`                         | Full authorized detail hub.                                   |
| `PATCH /residents/:residentId`                       | Editable profile only; identity links are server-controlled.  |
| `POST /residents/onboard`                            | Direct atomic onboarding commitment without Booking Lead.     |
| `POST /residents/:residentId/archive`                | Archive only when no active lifecycle.                        |
| `POST /residents/:residentId/account/reset-password` | Issue a new dedicated one-time credential receipt.            |
| `GET /my/resident-context`                           | Canonical Penghuni identity context.                          |
| `GET /my/onboarding-status`                          | Safe pending-activation state before resident context exists. |

There is no ordinary resident hard-delete endpoint. Draft/mistaken records with
zero history can use a separately guarded purge command only before account,
lease, occupancy, invoice, payment, vehicle, complaint, or file linkage exists.

`GET /my/onboarding-status` returns only status, planned start date, property
display name, category label, and room number from the authenticated user's
single committed awaiting-activation authority. Zero returns `{data:null}`;
ambiguity fails `409 RESIDENT_ONBOARDING_AMBIGUOUS`. It never substitutes for
`/my/resident-context` and disappears once activation succeeds or onboarding is
cancelled.

### 8.5 Leases

| Method and route                         | Purpose                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /leases`                            | Admin lease list; filters include status, end window, building, plan.                   |
| `GET /leases/:leaseId`                   | Lease, installment, occupancy, payment and deposit summary.                             |
| `POST /leases`                           | Existing lower-level lease creation authority, used by direct onboarding orchestration. |
| `POST /leases/:leaseId/activate`         | Activate after locked eligibility and financial prerequisites.                          |
| `POST /leases/:leaseId/transfer/preview` | Authoritative target/financial preview.                                                 |
| `POST /leases/:leaseId/transfer`         | End-period or emergency transfer.                                                       |
| `POST /leases/:leaseId/close`            | Complete/cancel lease through canonical close flow.                                     |
| `POST /leases/:leaseId/renew`            | Create linked renewal/addendum and new schedule.                                        |

Direct `/check-ins` remains denied with `LEASE_REQUIRED`. Compatibility checkout
applies only to an active occupancy without an active lease and remains an
audited legacy path.

### 8.6 Billing and payment

| Method and route                            | Purpose                                                               |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `GET /invoices` / `GET /invoices/:id`       | Invoice list/detail.                                                  |
| `POST /invoices/:id/issue` / `void`         | Explicit invoice lifecycle commands.                                  |
| `POST /payments`                            | Record manual cash or bank-transfer payment and selected allocations. |
| `POST /payments/:id/verify`                 | Verify evidence and commit allocations/receipt.                       |
| `POST /payments/:id/reject`                 | Reject pending transfer proof with safe reason.                       |
| `POST /payments/:id/reverse`                | Compensating reversal; no delete.                                     |
| `GET /payments` / `GET /payments/:id`       | Transaction and allocation history.                                   |
| `GET /payments/:id/receipt`                 | Mediated receipt document.                                            |
| `POST /other-charges`                       | Create non-rent invoice-backed charge.                                |
| `POST /leases/:id/security-deposit/collect` | Deposit liability collection.                                         |
| `POST /leases/:id/security-deposit/deduct`  | Documented deduction.                                                 |
| `POST /leases/:id/security-deposit/refund`  | Refund settlement.                                                    |

Payment Gateway session/webhook routes remain disabled and are not called by
Admin or Penghuni during this program.

### 8.7 Expenses

| Method and route                        | Purpose                                 |
| --------------------------------------- | --------------------------------------- |
| `GET/POST /expense-categories`          | Property category reference management. |
| `GET/POST /expenses`                    | Search/list and create draft expense.   |
| `GET/PATCH /expenses/:id`               | Detail/update while draft.              |
| `POST /expenses/:id/submit`             | Submit for approval.                    |
| `POST /expenses/:id/approve` / `reject` | Threshold-aware decision.               |
| `POST /expenses/:id/pay`                | Record actual cash outflow.             |
| `POST /expenses/:id/reverse`            | Compensating reversal.                  |

### 8.8 Reminder and notification

| Method and route                        | Purpose                                           |
| --------------------------------------- | ------------------------------------------------- |
| `GET /reminder-templates`               | Active/draft versions.                            |
| `POST /reminder-templates/versions`     | Create validated template version.                |
| `POST /reminder-templates/:id/activate` | Activate immutable version.                       |
| `GET /reminders/candidates`             | Derived invoice or lease-ending candidates.       |
| `POST /reminders/preview`               | Render protected template and selected invoices.  |
| `POST /reminders`                       | Freeze message snapshot and secure invoice links. |
| `POST /reminders/:id/open-whatsapp`     | Return `wa.me` URL and record opened action.      |
| `POST /reminders/:id/mark-sent`         | Manual operator confirmation; not delivery proof. |
| `GET /reminders/history`                | Immutable/archivable history.                     |
| `POST /reminders/:id/archive`           | Hide history without delete.                      |
| `GET /admin/notifications`              | Internal operational notifications.               |
| `GET /my/notifications`                 | Penghuni notifications.                           |

The preview accepts either one locked current-month invoice or a resident-scoped
list of selected unpaid invoice IDs. The server resolves every amount, period,
lease, room, recipient, and share link.

### 8.9 Vehicles, complaints, and maintenance

Existing route families remain:

- `/vehicles`, `/parking`, `/my/vehicles`;
- `/complaints`, `/my/complaints`;
- `/maintenance/technicians`, `/work-orders`, `/my/work-orders`.

All gain full detail links and property/building-scoped query support needed by
room/resident/Property Owner hubs. Complaint dispatch remains the sole authority
for complaint-linked actionable work orders. Vehicle/parking writes must not
change resident/lease/room lifecycle.

### 8.10 Property Owner

Property Owner reads use `/property-owner/*` route families but resolve active
building assignments first. Required query families:

- dashboard summary;
- buildings/rooms;
- resident and lease summaries;
- invoice/payment summaries;
- vehicles/parking;
- complaints/work orders;
- internal notifications;
- lease/payment/expense/cash-flow reports.

Every response includes only rows whose current or historical snapshot building
belongs to the authorized assignment period. All mutation methods return `403`.

### 8.11 Reports and exports

| Method and route                   | Purpose                                                 |
| ---------------------------------- | ------------------------------------------------------- |
| `GET /reports/leases/preview`      | Filtered lease rows and summary.                        |
| `GET /reports/payments/preview`    | Filtered verified/payment-state rows and summary.       |
| `GET /reports/expenses/preview`    | Filtered expense rows and summary.                      |
| `GET /reports/finance/preview`     | Cash-flow rows and totals.                              |
| `POST /reports/:type/exports`      | Freeze exact filter/scope and generate `pdf` or `xlsx`. |
| `GET /reports/exports/:id`         | Export status/metadata.                                 |
| `GET /reports/exports/:id/content` | Mediated download.                                      |

Export request body contains exact canonical filters and format only. Server
recomputes authorization and stores the normalized filter/scope checksum.
Admin/manager preview and export are property-scoped. `property_owner` preview
and export additionally intersect rows with the actor's effective
building-assignment interval, including historical snapshot building where
applicable. UI pagination never narrows the exported dataset.

## 9. File Mediation

The existing `files` service remains the only file authority.

Required purposes include:

- KTP, family/student cards, profile image;
- gallery/property logo;
- payment proof, receipt, invoice, lease agreement;
- expense proof;
- complaint, maintenance, room inspection, and vehicle evidence;
- generated report export.

Rules:

- upload is authenticated, property-scoped, rate-limited, and multipart;
- MIME is content-sniffed, not trusted from extension;
- size/type/dimension/page limits are purpose-specific;
- storage path is never returned;
- metadata returns whitelisted IDs, MIME, size, purpose, and mediated content
  route only;
- content uses authorization on every request, `nosniff`, safe disposition, and
  private cache policy;
- public invoice-share access uses a separate opaque expiring token route;
- preview uses a local object URL before upload and revokes it on close;
- soft delete is prohibited while a live domain reference exists;
- malware scanning can be added behind a quarantine state without changing the
  domain API.

## 10. Integration Adapters

### 10.1 Adapter boundary

NestJS modules depend on internal ports, never provider SDKs:

- `WhatsAppReminderPort`;
- `EmailReminderPort`;
- `FileStoragePort`;
- `PdfExportPort`;
- `SpreadsheetExportPort`;
- existing payment-gateway port remains disabled;
- Smart Lock/CCTV ports remain gated and outside this overhaul's live commands.

### 10.2 WhatsApp — manual first

Initial adapter: `ManualWhatsAppLinkAdapter`.

- returns a normalized `https://wa.me/<number>?text=<encoded>` URL;
- does not perform an external HTTP request;
- does not persist the URL or full message in audit;
- records `opened_whatsapp` only after an explicit user action;
- supports a separate `mark-sent` operator acknowledgement;
- never reports delivered/read.

Fonnte or Meta Cloud API is not configured or enabled. A future provider adapter
requires separate credentials, privacy review, webhook verification, retry,
quota, consent, and runtime approval.

### 10.3 Email — disabled adapter

Initial adapter: `DisabledEmailReminderAdapter`.

- preview remains available;
- send returns safe `EMAIL_DELIVERY_DISABLED`;
- a disabled action may be recorded without a delivery row claiming success;
- no SendGrid, Brevo, SMTP, or other provider call occurs.

### 10.4 PDF and Excel

- PDF and Excel adapters are local deterministic generators, not remote services.
- They accept a report snapshot DTO, never a database client or request.
- Output checksum and row count are recorded.
- PDF repeats headers, paginates, and avoids embedding large proof images.
- Excel uses typed date and numeric cells and separate Summary, Detail, and
  Allocation sheets where applicable.

### 10.5 Payment Gateway

Midtrans source/tables may remain for historical compatibility, but:

- session creation is not exposed in new UI;
- webhook/provider calls are not part of manual payment commands;
- reports exclude unverified gateway attempts;
- no credential or provider readiness claim is made.

## 11. TanStack Query and UI Consistency

### 11.1 Query keys

Every Admin domain key includes:

`domain + property_id + normalized filters`

Property Owner keys also include a stable authorization-scope version or
building-set checksum returned by auth context. Penghuni keys include account
ID, not resident/room IDs from client input.

Filters:

- sorted keys and order-insensitive arrays;
- bounded `limit`/`offset`;
- no NIK, KTP, phone, email, storage path, file URL, access token, or form PII.

Account switch/logout clears all account cache synchronously. Property switch
removes only old property-scoped entries and preserves user-scoped preferences.

### 11.2 Invalidation matrix

| Command                             | Required property-scoped invalidation                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lead status/hold                    | Leads, holds, rooms, availability, dashboard, reminders/notifications as applicable.                                                             |
| Onboarding commitment               | Leads, holds, residents, resident options, leases, rooms, availability, invoices, payments, dashboard, reminders.                                |
| Lease activate/renew/close/transfer | Lease list/detail, resident detail, room list/detail/availability, invoices/payments, dashboard, reminders, reports.                             |
| Payment verify/reverse              | Invoice list/detail, payment list/detail, resident billing, lease summary, dashboard, reminders, reports.                                        |
| Security-deposit command            | Lease/resident deposit summary, payment history, finance report; never rent invoice unless the command also contains a distinct rent allocation. |
| Expense command                     | Expense list/detail, approval queue, dashboard finance, reports.                                                                                 |
| Reminder command                    | Candidate list, reminder history, header count; internal notification only when a domain event requires it.                                      |
| Content mutation                    | Kost type, facilities/gallery/rules, public catalog, preview.                                                                                    |

Invalidate with authoritative property/building/resource IDs from the parsed
response, not stale active UI state. Stale success/error must not close or toast
inside a new scope.

## 12. Worker and Scheduler Rules

Workers may derive:

- hold expiry;
- lease activation-eligibility work at the start/check-in boundary; the worker
  never opens occupancy automatically;
- invoice issue/overdue state;
- lease ending candidates H-60/H-30/H-14;
- outbox dispatch;
- expired share links/report exports.

Requirements:

- bounded batch, default 100;
- deterministic property ordering;
- property advisory lock before row `FOR UPDATE SKIP LOCKED`;
- database clock, not process clock, for eligibility;
- same domain service/transaction invariants as interactive commands;
- safe catch-up after downtime;
- one audit/outbox effect per logical transition;
- no outbound email/WhatsApp provider call while adapters are disabled/manual.

## 13. Observability and Privacy

- Correlation ID is returned in safe errors and preserved in logs/audit/outbox.
- Metrics record route, status, duration, rows, lock wait, replay, and worker
  counts without PII.
- Financial metrics separate rent, other charge, security-deposit liability,
  expense, refund, reversed, and pending amounts.
- Logs redact authorization, cookies, password, temporary credentials, phone,
  email, NIK, KTP, signed/share token, file path, and message body.
- Raw request/response bodies are not logged on identity, payment, reminder, or
  file routes.

## 14. Compatibility and Rollout

- Each vertical slice starts behind a property feature flag when it changes a
  write authority.
- Reads and release/reversal/expiry commands needed for recovery remain
  available when create rollout is off.
- Rollout false or absent fails closed for new creation.
- Legacy clients remain on legacy route/envelope until cut over.
- New source must not register dormant duplicate controllers.
- Payment Gateway, automatic WhatsApp/email, Smart Lock live commands, and CCTV
  integration remain disabled independently of overhaul rollout.

## 15. Acceptance Evidence

| ID                   | Required proof                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `QA-AUTH-001`        | Role, permission, property, resident, and building scope deny before lookup/write; empty scope denies all.                           |
| `QA-OPS-001`         | V2 media dispatch reaches the one live controller; legacy behavior remains compatible.                                               |
| `QA-OPS-002`         | Exact envelope, pagination boundaries, out-of-range page, strict validation, and safe errors.                                        |
| `QA-OPS-003`         | Idempotency same-key replay, reused-key conflict, in-flight conflict, rollback, and safe response snapshot.                          |
| `QA-PROPERTY-001`    | Property Owner cannot read or infer data outside active building assignments.                                                        |
| `QA-LEASE-001`       | Onboarding commitment and lease activation are separately atomic; transfer locks and mutates only its defined lifecycle authorities. |
| `QA-PAYMENT-001`     | Payment verification/reversal uses one transaction client for proof, allocation, invoice, receipt, audit, and outbox.                |
| `QA-REMINDER-001`    | Manual WhatsApp claims only opened/manual-sent; email disabled never claims delivery.                                                |
| `QA-INTEGRATION-001` | No Payment Gateway/provider/SMTP/WhatsApp external host request occurs in the approved initial runtime.                              |
| `QA-REPORT-001`      | Preview/PDF/Excel filters, authorization, row IDs, totals, and checksum evidence match.                                              |
