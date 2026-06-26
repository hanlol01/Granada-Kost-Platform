# Executive Summary

`BACKEND_ARCHITECTURE.md` adalah blueprint final untuk memulai backend Granada Kost Platform sebelum implementasi NestJS dibuat. Dokumen ini menyatukan keputusan dari domain model, database planning, API planning, security policy, smart lock policy, CCTV architecture, roadmap, dan backlog.

Backend Granada Kost Platform dirancang sebagai NestJS modular monolith pada Phase 1. Pendekatan ini menjaga developer experience tetap sederhana, tetapi tetap memberi batas module yang kuat untuk berkembang ke multi-property, workload async, integrasi provider, dan audit security yang lebih berat.

Target awal adalah satu properti utama dengan sekitar 200 kamar. Semua desain tetap multi-property-ready sejak awal melalui property scoping, role assignment per property, dan aturan akses yang tidak bergantung pada asumsi single-property.

Keputusan stack:

- Frontend: React + TanStack untuk `apps/admin` dan `apps/penghuni`.
- Backend: NestJS.
- Database utama: PostgreSQL.
- Cache, rate limit, session pendek, idempotency window, dan queue: Redis.
- Storage awal: local object storage melalui adapter.
- Storage masa depan: S3-compatible object storage tanpa mengubah domain modules.
- Smart Lock: Tuya Cloud API melalui backend saja.
- CCTV: hybrid local recording dengan backend-managed metadata, authorization, audit, dan preview session.

Tujuan utama arsitektur:

- Maintainability: module boundary jelas, dependency terarah, dan domain logic tidak tersebar.
- Scalability: siap untuk multi-property, queue, cache, outbox, dan log volume tinggi.
- Security: backend menjadi policy enforcement point untuk auth, RBAC, Smart Lock, CCTV, file, dan financial operation.
- Auditability: semua operasi sensitif memiliki actor, resource, result, timestamp, IP/user agent, dan correlation id.
- Developer experience: pola folder, naming, validation, testing, dan error handling konsisten.

# Architectural Principles

1. Backend adalah policy enforcement point.
   Frontend tidak boleh menjadi sumber kebenaran untuk authorization, property scope, resident self-scope, Smart Lock permission, CCTV permission, atau file privacy.

2. PostgreSQL adalah system of record.
   Redis boleh mempercepat cache, rate limit, queue, session pendek, dan idempotency, tetapi tidak menjadi sumber utama data bisnis.

3. Modul mengikuti bounded context.
   Modul backend dipisah berdasarkan domain seperti IAM, Property, Room, Penghuni, Billing, Deposit, Complaint, Maintenance, Smart Lock, CCTV, Notification, File, Audit, dan Reporting.

4. API-first, bukan handler-first.
   Endpoint dirancang dari capability dan workflow. HTTP handler hanya menjadi entrypoint tipis menuju application use case.

5. Domain logic tidak bergantung pada framework detail.
   Business rule, state transition, permission decision, dan event intent harus bisa dipahami tanpa membaca transport layer.

6. Semua operasi sensitif harus auditable.
   Financial update, PII update, RBAC change, Smart Lock command, CCTV preview, private file access, and export harus memiliki audit trail.

7. Security by default.
   Default akses adalah deny. Permission diberikan eksplisit, property scope diverifikasi server-side, dan resource tersembunyi dikembalikan sebagai not found bila perlu mencegah data leak.

8. Multi-property-ready sejak Phase 1.
   Walaupun operasional awal satu properti, desain module, permission, query scope, event, audit, dan report tidak boleh mengunci sistem ke single-property.

9. Provider integration harus melalui anti-corruption layer.
   Tuya, CCTV gateway, storage provider, dan notification provider tidak boleh bocor sebagai model mentah ke domain atau API response.

10. Cross-context effect memakai event dan outbox.
    Billing overdue, check-in, check-out, payment verification, Smart Lock restriction, notification, dan audit harus terhubung dengan event yang idempotent, bukan direct coupling yang rapuh.

# Backend Layering Strategy

Backend memakai layering berikut:

- Transport layer: menerima HTTP request, menjalankan guard, parsing request, dan mengembalikan response standar.
- Application layer: menjalankan use case, orchestration, authorization decision, transaction boundary, idempotency, dan event publishing intent.
- Domain layer: menyimpan business rule, domain state transition, domain event shape, policy object, dan invariant.
- Infrastructure layer: mengelola database access, Redis, queue, object storage, Tuya client, CCTV gateway client, email/push/WhatsApp provider, logging, dan configuration.
- Shared kernel: utilitas lintas module yang benar-benar generic seperti result codes, correlation id, pagination contract, date helpers, dan base error taxonomy.

Aturan layering:

- Transport boleh bergantung ke application.
- Application boleh bergantung ke domain dan interface infrastructure.
- Domain tidak boleh bergantung ke NestJS, database client, Redis, HTTP, provider SDK, atau file storage detail.
- Infrastructure mengimplementasikan interface yang dibutuhkan application/domain.
- Shared kernel tidak boleh menjadi tempat dumping business logic.

Application layer harus menjadi pusat workflow:

- Login, refresh, logout, dan session revocation.
- Manual onboarding Penghuni.
- Check-in dan check-out.
- Invoice issue, payment proof verification, dan overdue detection.
- Deposit settlement.
- Smart Lock command dan restriction approval.
- CCTV preview session issuance.
- File access token issuance.
- Audit export dan report export.

# Folder Structure Strategy

Folder backend harus membantu engineer memahami boundary tanpa membuka seluruh codebase.

Strategi struktur:

- `backend/api` menjadi root aplikasi NestJS.
- `src/app` untuk bootstrap aplikasi, global middleware, global filter, global pipes, dan global guards.
- `src/modules` untuk domain modules.
- `src/shared` untuk shared kernel yang aman dipakai lintas module.
- `src/infrastructure` untuk adapter lintas module seperti database, Redis, queue, storage, logging, config, provider clients, dan observability.
- `src/jobs` atau queue worker area untuk worker process bila dipisahkan dari HTTP runtime.
- `src/testing` untuk factory, test doubles, dan helper test backend.

Setiap domain module mengikuti pola internal yang konsisten:

- transport boundary untuk API entrypoint.
- application boundary untuk command/query/use case.
- domain boundary untuk rule, policy, event, dan invariant.
- infrastructure boundary untuk repository dan external adapter milik module.

Folder tidak boleh didesain berdasarkan tabel database saja. Contoh: Billing module boleh memiliki invoice, payment, late fee, dan payment proof workflow karena semuanya bagian dari capability billing, bukan karena nama tabelnya sama.

# Module Strategy

Phase 1 memakai module berikut:

| Module | Ownership |
|---|---|
| IAM | user, role, permission, session, password reset, property role assignment |
| Property | property profile, property settings, property owner assignment |
| Room | room, room type, facility, availability, room state transition |
| Penghuni | resident profile, resident document ownership, resident lifecycle |
| Occupancy | active occupancy and occupancy history read model |
| Lease | lease, extension request, check-in, check-out workflow boundary |
| Deposit | deposit charge, deduction, refund, settlement |
| Billing | billing period, invoice, payment proof, payment verification, overdue |
| Complaint | resident complaint, complaint status, complaint files |
| Maintenance | work order, technician assignment, work history |
| Smart Lock | device metadata, access grant, command, restriction, alert, access log |
| CCTV | camera metadata, preview session, snapshot request, camera access log, alert |
| Notification | notification, announcement, rules, FAQ, delivery intent |
| File | file metadata, file links, signed/backend access, private file audit |
| Audit | audit log query, auth event query, security export |
| Reporting | occupancy, revenue, billing aging, payment, complaint, maintenance, security reports |
| Outbox | domain event persistence, dispatch, retry, dead-letter handling |

Phase 2 modules or expansions:

- Public Booking.
- Payment Gateway.
- Advanced Smart Lock telemetry and async vendor command queue.
- Advanced CCTV gateway and stream health.
- Chat.
- Push/WhatsApp delivery provider expansion.
- Advanced Reporting snapshots and scheduled exports.
- Contract/legal document generation.
- Preventive Maintenance and vendor management.

Module ownership rules:

- A module owns its write model.
- Other modules request changes through application use cases or events, not by writing another module's repository directly.
- Reporting may read across modules through approved read models, not by becoming a place for business mutations.
- Audit receives event/audit records but does not own the original business decision.
- Notification reacts to events and user preferences; it must not decide the source workflow state.

# Module Dependency Rules

Allowed dependency direction:

- Feature module transport -> feature module application.
- Feature module application -> feature module domain.
- Feature module application -> shared infrastructure interfaces.
- Feature module infrastructure -> infrastructure clients.
- Reporting read side -> approved read repositories or read models.
- Outbox dispatcher -> event consumers through explicit subscription contracts.

Forbidden dependency patterns:

- Direct write from one domain module into another domain module repository.
- Smart Lock module directly changing Billing state.
- Billing module directly executing Tuya command.
- CCTV module exposing raw local stream URLs to transport.
- Property Owner APIs reusing admin mutation use cases.
- Resident APIs accepting arbitrary resident id for self-owned resources.
- Provider response objects returned directly to frontend.
- Secret, private object key, RTSP URL, camera IP, or Tuya credential crossing into API response.
- Shared module containing business rules from specific bounded contexts.

Cross-module collaboration must use one of these patterns:

- Synchronous application call only when both modules are part of the same user action and transaction boundary is clear.
- Domain event through outbox for side effects after state change.
- Read model query for reporting or dashboards.
- Policy interface for authorization checks that need central IAM knowledge.

# Authentication Architecture

Authentication uses email/phone plus password for Phase 1, with support for future step-up authentication if high-risk actions require it.

Authentication flow:

- Login validates credentials and user status.
- Login creates a server-tracked session.
- Access token is short-lived.
- Refresh token or session credential is tracked server-side and can be revoked.
- Logout revokes current session.
- Logout-all revokes all active sessions for the user.
- Password reset tokens are hashed, short-lived, and one-time use.

Access token claims should be minimal:

- user id.
- session id.
- role codes.
- safe property scope summary.
- resident id when the user is a Penghuni.

Claims are optimization hints, not final authority. Sensitive authorization must re-check database-backed role, session, property assignment, resident linkage, permission, and resource state.

Login and password reset must be rate-limited by IP and identifier. Failed auth attempts must create auth security events without leaking whether a user exists.

# Authorization Architecture

Authorization combines:

- authentication guard.
- role guard.
- permission guard.
- property scope guard.
- resident self-scope guard.
- technician assignment guard.
- workflow/state guard.
- resource ownership guard.

Property scoping rules:

- Internal staff access is scoped by `user_property_roles`.
- `property_owner` access is scoped by property ownership assignment plus read-only role.
- `resident` access is derived from authenticated user to resident relation, never from request-provided resident id.
- `technician` access is limited to assigned work orders unless explicitly elevated.

Sensitive permission examples:

- `rbac.manage`
- `audit.view`
- `audit.export`
- `billing.manage`
- `payment.verify`
- `deposit.manage`
- `smart_lock.view`
- `smart_lock.command`
- `cctv.view`
- `file.private.access`
- `report.export`

Authorization response behavior:

- Return unauthenticated for missing or invalid authentication.
- Return forbidden when authenticated but not allowed and no resource hiding is needed.
- Return not found when revealing resource existence would leak cross-property or cross-user information.

# RBAC Architecture

Role codes:

| Role code | Meaning |
|---|---|
| `owner` | platform/operator owner with highest access |
| `manager` | operational manager with broad property operations |
| `admin` | daily administrative staff |
| `technician` | maintenance staff assigned to work orders |
| `resident` | Penghuni using the resident PWA |
| `property_owner` | Pemilik Rumah Kost / investor, read-only and property-scoped |

RBAC is permission-based under role baseline. Roles provide defaults, but sensitive capabilities must be represented as explicit permissions so the platform can evolve without role explosion.

`property_owner` hard rules:

- read-only only.
- scoped to assigned properties only.
- no Smart Lock access.
- no CCTV access.
- no Settings access.
- no Billing Management access.
- no operational mutation.
- may view property, rooms, resident summary, payment/revenue summary, and occupancy summary for owned properties.

`resident` hard rules:

- may access only own profile, active room, billing, payment proof workflow, complaints, notifications, lease extension request, check-out request, and own allowed Smart Lock access.
- may not pass arbitrary resident id to read another Penghuni's data.

`technician` hard rules:

- may view and update assigned work orders.
- may not manage billing, deposits, RBAC, Smart Lock command, CCTV preview, or settings unless a future explicit permission is approved.

RBAC changes are owner-only by default and must be audited with before/after values.

# Session & Token Architecture

Session model:

- Server stores session record with user, device name, IP address, user agent, expiry, revoked state, and last activity.
- Access token is short-lived.
- Refresh/session credential is revocable and rotated when appropriate.
- Session id is included in access token for server-side validation.

Session security rules:

- Refresh is rate-limited per session and user.
- Suspicious refresh failure is audited.
- Password reset or role revocation can force session invalidation.
- Logout all devices is available to authenticated users.
- Owner/manager may revoke sessions during account security handling.

Token storage strategy is frontend-specific, but backend must assume tokens can be stolen. Therefore high-risk operations must still use fresh authorization checks, rate limits, state guards, and audit.

CCTV preview tokens and file access tokens are not normal auth tokens. They are short-lived resource tokens, bound to actor/resource/session intent, stored hashed or verifiable server-side, and revocable.

# Audit Log Architecture

Audit must answer:

- who attempted the action.
- what action was attempted.
- which resource was affected.
- which property scope applied.
- when it happened.
- from where it happened.
- whether it succeeded, failed, was denied, or timed out.
- which correlation id connects request, event, provider operation, and log entry.

Audit layers:

- Generic audit log for cross-cutting business changes.
- Auth audit events for login, failed login, logout, password reset, and session revocation.
- Smart Lock access logs for every command attempt and result.
- CCTV access logs for preview, snapshot, token issuance, and denied access.
- File access logs for private/sensitive files.
- Financial audit for invoice, payment, deposit, adjustment, refund, and verification workflows.
- RBAC audit for role, permission, and property assignment changes.

Audit data must avoid unnecessary PII duplication. Prefer resource references and safe before/after summaries. Sensitive fields such as KTP number, private file key, provider token, camera URL, password hash, and raw provider payload must not be logged.

Every request receives a correlation id. If the client supplies a valid correlation header, backend may accept it; otherwise backend creates one. Correlation id must propagate into logs, audit, outbox events, queue jobs, provider calls, and error responses.

# Error Handling Architecture

All API errors use a consistent response shape:

| Field | Meaning |
|---|---|
| `success` | always false for errors |
| `error.code` | stable machine-readable code |
| `error.message` | safe human-readable message |
| `error.details` | optional safe validation or context details |
| `correlation_id` | request correlation id |
| `timestamp` | server timestamp |

Error code principles:

- Stable enough for frontend handling.
- Domain-specific where helpful, such as invalid state transition or restricted lock access.
- Safe for users; no internal stack traces, provider credentials, object keys, camera URLs, or database internals.

HTTP status mapping:

- 400 for malformed request or invalid simple input.
- 401 for missing or invalid authentication.
- 403 for authenticated user without permission.
- 404 for missing resource or hidden cross-scope resource.
- 409 for conflict and concurrent state changes.
- 422 for business rule violation.
- 429 for rate limit.
- 500 for unexpected backend error.
- 502 for provider/gateway error.
- 503 for provider, device, or gateway unavailable.

Provider errors must be translated through an anti-corruption layer. Frontend must receive safe provider status, not raw Tuya or CCTV gateway response.

# Validation Architecture

Validation happens in three layers:

- Request validation: shape, type, allowed values, size, file metadata, pagination, sorting, and filters.
- Application validation: permission, property scope, idempotency, workflow state, and resource ownership.
- Domain validation: business invariant and state transition rule.

Validation rules:

- All list filters and sort fields are allowlisted.
- Date ranges are required for high-volume logs and exports.
- File upload validates size, MIME type, purpose, and ownership.
- Money values use one consistent minor-unit strategy.
- State changes use explicit transition actions, not free-form status update.
- Smart Lock unlock requires stricter validation than lock.
- CCTV preview validates permission, camera status, property scope, and rate limit before token issuance.

Validation errors must use the standard error response with safe details. Validation must not reveal hidden cross-property resources.

# Database Access Strategy

Database access is module-owned and repository-oriented.

Rules:

- PostgreSQL remains authoritative.
- Each module owns repositories for its write model.
- Other modules cannot bypass ownership by writing directly to another module's tables through a shared database client.
- Query/read models may be separate when dashboard/reporting requires cross-module reads.
- Database-specific details stay in infrastructure, not in domain rules.
- Domain and application layers must not depend on ORM-specific primitives.

Data access must support:

- property scoping on all property-owned records.
- resident self-scope.
- soft-deactivate patterns for master data where history matters.
- append-friendly financial records.
- high-volume logs with date filters and pagination.
- future partitioning or archive strategy for audit, Smart Lock, CCTV, and file access logs.

Repository methods should express business intent, not generic table operations. Examples of intent are active occupancy lookup, unpaid invoice search, owned property list, active lock grant lookup, and valid preview session creation.

# Transaction Strategy

Transactions wrap business state changes that must succeed or fail together.

Transaction rules:

- Create or update core business state and write outbox event atomically.
- Write audit entry in the same transaction when audit is required for the business decision.
- Do not keep database transactions open while waiting on external providers like Tuya, CCTV gateway, object storage, or notification provider.
- Use idempotency keys for retry-prone commands.
- Use optimistic concurrency or equivalent conflict protection for critical state transitions.

Important transaction boundaries:

- manual resident onboarding.
- complete check-in.
- finalize check-out.
- issue invoice.
- verify payment proof.
- assess late fee.
- deposit deduction/refund/settlement.
- approve Smart Lock restriction.
- create CCTV preview session token.
- create private file access token.
- create export job.

Provider side effects should be orchestrated after durable intent is recorded. If a provider call fails, the system records failed result, audit, and retry eligibility according to the workflow.

# Redis Strategy

Redis is used for ephemeral and performance-sensitive workloads:

- rate limit counters.
- login and password reset throttling.
- Smart Lock command throttling.
- CCTV preview throttling.
- idempotency windows.
- short-lived preview/file token lookup where appropriate.
- queue backend.
- lightweight cache for read-heavy reference data.
- distributed lock only for narrow critical sections when database constraint is not sufficient.

Redis must not be the only place where business-critical state exists. If Redis is flushed, the system may lose cache, rate counters, and temporary sessions/tokens, but must not lose invoices, payments, access logs, audit logs, resident data, or device records.

Cache rules:

- Cache only data that can be regenerated from PostgreSQL or provider refresh.
- Use short TTL for security-sensitive data.
- Invalidate cache after writes in the owning module.
- Never cache raw provider secrets or private file keys.

# Queue Strategy

Queue workers handle async workloads that should not block API response or that need retry:

- outbox event dispatch.
- notification delivery.
- report export.
- audit export.
- file processing and optional scanning.
- invoice generation jobs.
- overdue detection jobs.
- Smart Lock status sync.
- Smart Lock command retry if Phase 2 async command queue is enabled.
- CCTV status refresh.
- cleanup of expired preview sessions and file access tokens.

Queue rules:

- Jobs are idempotent.
- Job payload contains references, not large PII snapshots.
- Job logs include correlation id.
- Retry uses backoff.
- Poison jobs move to dead-letter state with operational visibility.
- Security-sensitive jobs preserve audit on success, failure, denial, and timeout.

Queue execution must not bypass authorization decisions. For user-initiated jobs, the original actor, permission decision, property scope, and correlation id must be recorded before the job runs.

# File Storage Strategy

Files are stored outside PostgreSQL. PostgreSQL stores file metadata, ownership, links to domain resources, visibility, checksum, size, MIME type, storage provider, object key reference, and access logs.

Phase 1 storage:

- Local object storage adapter.
- Private files served through backend stream token or signed access abstraction.
- Public files allowed only for explicitly public assets such as approved property logo.
- Sensitive files audited on access.

Future storage:

- S3-compatible provider through the same storage adapter interface.
- Domain modules must not change when storage provider changes.
- Object key format must avoid exposing business-sensitive details.

Sensitive file categories:

- resident identity file.
- payment proof.
- complaint photo.
- maintenance photo.
- deposit evidence.
- check-out inspection photo.
- invoice PDF.
- CCTV snapshot if saved as evidence.

File rules:

- Never expose raw private object key.
- Never trust frontend-provided MIME type alone.
- Enforce file size limits.
- Require authorization for metadata read and content access.
- Soft-delete metadata according to retention policy.
- Private file access creates file access audit entry.

# Notification Strategy

Notification is event-driven and provider-pluggable.

Phase 1 notification channels:

- in-app notification.
- announcement, rules, and FAQ content for Penghuni-facing surfaces.
- delivery intent records for future provider expansion.

Phase 2 channels:

- PWA push notification.
- email.
- WhatsApp or other messaging provider.

Notification sources:

- check-in completed.
- check-out workflow update.
- invoice issued.
- invoice overdue detected.
- payment proof uploaded.
- payment verified or rejected.
- deposit settlement update.
- complaint created or status changed.
- work order assigned or completed.
- Smart Lock alert.
- CCTV alert.
- announcement published.

Notification module must not own source workflow state. It consumes events, applies recipient/audience rules, writes notification records, and dispatches through configured channels.

# Smart Lock Integration Strategy

Smart Lock is a high-risk physical security feature. All lock/unlock/restrict/unrestrict operations must go through backend.

Provider:

- Tuya Cloud API.
- Tuya credentials and secrets stored only in backend configuration or secret manager.
- Provider responses are translated into safe domain result codes.

Command rules:

- Authentication required.
- Explicit permission required.
- Property scope required.
- Resident self-scope required for Penghuni app commands.
- Active access grant required.
- Redis rate limit required.
- Idempotency key required for retry-prone commands.
- Every attempt is logged, including denied, failed, timeout, queued, and success.
- Unlock is more strictly limited than lock.
- Device offline returns safe unavailable response.
- Restricted state blocks resident unlock unless an approved workflow lifts restriction.

Billing restriction rules:

- Billing overdue creates restriction workflow intent.
- No full debt-based restriction command runs without admin/manager approval in Phase 1.
- Approval or rejection is audited.
- Restriction and unrestriction results are audited.
- Property owner cannot approve, reject, view command detail, or execute Smart Lock action.

Resident Smart Lock rules:

- Penghuni can only command device linked to active room and active access grant.
- Penghuni cannot bypass billing restriction, checkout restriction, security restriction, or revoked grant.

Operational rules:

- Device status sync runs through scheduled job.
- Battery warning and danger thresholds create alerts.
- Multiple failed attempts create security alert.
- Smart Lock access history remains queryable for audit and reporting.

# CCTV Integration Strategy

CCTV uses hybrid architecture:

- Recording remains local on NVR/gateway.
- Backend stores camera metadata, authorization policy, preview sessions, access logs, and alerts.
- Admin panel receives preview through short-lived session/token flow.
- Frontend never receives raw RTSP URL, internal camera IP, NVR credential, or provider secret.

Preview session rules:

- Authentication required.
- Explicit CCTV permission required.
- Property scope required.
- Camera active/status validation required.
- Redis rate limit required.
- Session/token is short-lived.
- Session/token is revocable.
- Preview start, end, snapshot, token issued, token denied, and refresh status are audited.

Role rules:

- owner, manager, and selected admin may receive CCTV permission.
- property_owner has no CCTV access by default.
- resident has no CCTV access.
- technician has no CCTV access unless a future explicit operational permission is approved.

Gateway assumptions:

- Local gateway/NVR handles recording and stream source.
- Backend controls authorization and token issuance.
- Backend or gateway adapter maps token to stream access without exposing local camera details.
- Stream health and motion events are Phase 2 unless required earlier by operation.

# Domain Event Strategy

Domain events describe business facts that already happened or durable intents that must be processed.

Event naming:

- Lowercase dot notation.
- Past tense for completed facts.
- Clear aggregate or workflow prefix.

Core event examples:

- `resident.created`
- `check_in.completed`
- `check_out.finalized`
- `invoice.issued`
- `invoice.overdue_detected`
- `payment.proof_uploaded`
- `payment.verified`
- `deposit.settled`
- `complaint.created`
- `work_order.completed`
- `smart_lock.command_requested`
- `smart_lock.command_executed`
- `smart_lock.restriction_approved`
- `cctv.preview_started`
- `file.private_access_granted`

Event rules:

- Events carry resource references and safe summary data.
- Events include property id when property-scoped.
- Events include correlation id.
- Events include actor id when user-initiated.
- Consumers are idempotent.
- Consumers must not assume event ordering beyond what the producer guarantees.
- Security-sensitive events must preserve audit context.

Events are not a substitute for authorization. Authorization happens before user-initiated state changes, and the event records the outcome.

# Outbox Pattern Strategy

The outbox pattern is required for cross-context workflows that need reliable side effects.

Outbox flow:

- Application use case changes business state.
- The same transaction records outbox event.
- Worker reads pending outbox events.
- Worker dispatches to internal consumers.
- Consumer processes idempotently.
- Worker marks event processed, retried, or dead-lettered.

Use outbox for:

- Billing overdue to Smart Lock restriction workflow.
- Payment verification to invoice update, notification, and restriction review.
- Check-in to occupancy, room status, Smart Lock grant, and notification.
- Check-out to occupancy closure, room status, deposit settlement, Smart Lock grant revocation, and notification.
- Complaint creation to maintenance and notification.
- Smart Lock command result to audit and notification/alert.
- CCTV preview start to audit.

Outbox rules:

- Producer owns event creation.
- Consumer owns side effect.
- Event payloads are versioned.
- Failed events retry with backoff.
- Dead-letter events are visible to owner/manager or operations tooling.
- Replaying an event must not duplicate financial, audit, notification, or security effects.

# Observability & Logging Strategy

Observability baseline:

- Correlation id on every request.
- Structured application logs.
- Security audit logs separate from debug logs.
- Health check for application, database, Redis, queue, storage, Tuya connectivity, and CCTV gateway connectivity.
- Metrics-ready counters and timers for request latency, error rate, queue lag, provider latency, provider failure, rate limit hits, auth failures, Smart Lock command result, and CCTV preview session creation.

Logging rules:

- No passwords, token values, provider secrets, private object keys, KTP full values, RTSP URLs, camera IPs, or raw sensitive payloads.
- Log resource references and safe status.
- Log provider errors as normalized code plus safe message.
- Use consistent log levels.
- Include property id and actor id where safe and useful.

Operational dashboards should eventually show:

- API health and latency.
- database and Redis availability.
- queue lag and dead-letter count.
- auth failure spikes.
- Smart Lock command success/failure/timeout.
- CCTV preview issuance and gateway errors.
- file access errors.
- outbox retry/dead-letter count.

# Security Hardening Strategy

Security baseline:

- HTTPS-only deployment.
- CORS allowlist for admin and Penghuni domains.
- Secure headers.
- Request size limits.
- Strict file upload limits.
- Environment-based secret management.
- Password hashing with strong algorithm and tunable cost.
- Backend-only provider credentials.
- Safe error responses.
- Centralized auth and authorization guards.
- Audit for sensitive operation.

Data protection:

- Minimize PII exposure.
- Mask sensitive values in logs and audit summaries.
- Avoid PII duplication in event payloads.
- Private files require signed/backend access.
- Resident identity files, payment proofs, and financial data require stricter authorization.

Smart Lock hardening:

- Explicit permission for command.
- Very strict rate limit for unlock.
- Audit all attempts.
- Deny direct frontend-to-Tuya integration.
- Human approval for debt-based restriction in Phase 1.
- Alert on repeated failures and low battery.

CCTV hardening:

- Explicit permission for preview.
- Short-lived revocable token/session.
- Audit all preview and snapshot actions.
- No raw RTSP/IP exposure.
- No property_owner access by default.

RBAC hardening:

- Owner-only RBAC changes by default.
- property_owner role cannot receive write permission.
- technician assignment scope enforced server-side.
- resident self-scope enforced server-side.
- Permission checks never rely only on frontend route visibility.

# Configuration Management Strategy

Configuration is validated at startup and grouped by domain:

- application environment.
- HTTP host/port and public base URL.
- database connection.
- Redis connection.
- JWT/access token settings.
- session/refresh token settings.
- CORS allowed origins.
- storage provider and local storage root.
- Tuya provider configuration.
- CCTV gateway configuration.
- notification provider configuration.
- logging level.
- rate limit defaults.
- queue settings.

Configuration rules:

- Fail fast on missing required config.
- Keep secrets out of frontend bundle.
- Keep provider secrets out of logs.
- Use different config profiles for local, staging, and production.
- Use safe defaults for local development.
- Use explicit production requirements for HTTPS, CORS, secret strength, and storage path.

Feature flags may be used for risky integrations:

- resident Smart Lock command availability.
- CCTV preview availability.
- payment gateway integration.
- push/WhatsApp delivery.
- public booking.
- advanced reporting snapshots.

# Testing Strategy

Testing pyramid:

- Unit tests for domain rules, policies, validation helpers, state transitions, and authorization decisions.
- Application tests for use cases, transaction behavior, idempotency, outbox creation, and audit creation.
- Integration tests for repository behavior, Redis-backed rate limit/idempotency, queue worker, storage adapter, and provider adapter test doubles.
- API tests for auth, RBAC, property scope, resident self-scope, technician scope, error shape, pagination, filtering, and forbidden access.
- Security regression tests for Smart Lock, CCTV, file access, RBAC, and cross-property data leak prevention.
- End-to-end smoke tests for core Phase 1 workflows.

High-priority test scenarios:

- property_owner cannot mutate any operational data.
- property_owner cannot access Smart Lock, CCTV, Settings, or Billing Management.
- resident cannot read another Penghuni's billing, complaint, notification, or file.
- technician cannot access unassigned work order.
- Smart Lock unlock is denied without permission, grant, or valid state.
- Smart Lock overdue restriction requires admin/manager approval.
- CCTV preview does not expose raw stream URL or camera IP.
- private file access creates audit log.
- payment verification creates outbox event and audit.
- check-out finalization revokes lock grant through event flow.
- hidden cross-property resource does not leak existence.

Docs verification for this architecture artifact:

- Required headings appear once.
- No backend scaffold or implementation files are added.
- Document remains consistent with domain, database, API, security, smart lock, CCTV, roadmap, and backlog planning.

# Coding Convention

Backend code should follow consistent conventions once implementation begins:

- One module owns one bounded context or cohesive platform capability.
- Application use cases are named around business actions.
- Query use cases are separated from command use cases when behavior differs.
- Domain policies express authorization-sensitive business decisions clearly.
- Provider adapters translate external provider vocabulary into internal safe vocabulary.
- Shared helpers stay generic.
- Error codes are stable and documented.
- Audit calls are explicit for sensitive workflows.
- Tests live near the module or in a clear test area with readable factories.

Implementation should avoid:

- framework-specific logic inside domain rules.
- generic "god service" orchestration across all modules.
- business rules inside DTO validation only.
- direct provider SDK calls from application use cases without adapter boundary.
- returning raw provider payloads.
- logging secrets or sensitive payloads.
- duplicating role checks inconsistently across handlers.

# Naming Convention

General naming:

- Module names use domain language: IAM, Property, Room, Penghuni, Billing, Deposit, Complaint, Maintenance, SmartLock, CCTV, Notification, File, Audit, Reporting, Outbox.
- Product/user-facing text uses "Penghuni", not "Tenant".
- Technical role code for Penghuni remains `resident`.
- Technical role code for Pemilik Rumah Kost is `property_owner`.
- Permission codes use lowercase dot notation.
- Domain events use lowercase dot notation.
- Error codes use stable uppercase snake case or a documented equivalent.
- Database-facing enum values use lowercase snake case.
- API-facing fields use one consistent casing style as defined by API planning.

Recommended permission naming:

- resource action style.
- examples: `room.read`, `room.manage`, `resident.read`, `resident.manage`, `billing.read`, `billing.manage`, `payment.verify`, `smart_lock.command`, `cctv.view`, `audit.export`.

Recommended event naming:

- aggregate or workflow prefix plus completed action.
- examples: `invoice.overdue_detected`, `check_out.finalized`, `smart_lock.command_executed`.

Recommended workflow action naming:

- explicit verbs such as approve, reject, verify, finalize, revoke, restrict, unrestrict, issue, settle, assign, complete.
- avoid generic update for sensitive state transitions.

# Backend Build Order

Recommended build order:

1. Backend foundation.
   Bootstrap NestJS app structure, config validation, logging, correlation id, health checks, database connection, Redis connection, and global error/validation behavior.

2. IAM and RBAC.
   Implement users, roles, permissions, sessions, refresh flow, property role assignment, guards, and audit for auth/RBAC.

3. Property, Room, and Penghuni foundations.
   Implement property scope, property settings, rooms, room types, facilities, resident profile, and active occupancy read behavior.

4. Lease, check-in, check-out, and deposit workflows.
   Implement stateful onboarding and exit workflows before deep billing automation.

5. Billing and manual payment workflow.
   Implement invoice, payment proof, manual verification, overdue detection, and late fee behavior.

6. Complaint and maintenance.
   Implement resident complaint, admin management, technician assignment, and work order status.

7. File and notification.
   Implement local storage adapter, file metadata, private access audit, in-app notifications, announcements, rules, and FAQ.

8. Audit and reporting.
   Implement audit query/export boundaries and Phase 1 operational reports.

9. Outbox and queue workers.
   Implement reliable event processing for cross-context workflows.

10. Smart Lock.
    Implement device metadata, access grant, Tuya adapter boundary, command audit, rate limit, status sync, and human-approved restriction workflow.

11. CCTV.
    Implement camera metadata, preview session token, gateway adapter boundary, access audit, snapshot request, and status refresh.

12. Hardening pass.
    Add security regression tests, cross-property leak tests, rate limit tests, provider failure tests, and operational monitoring checks.

# Phase 1 Backend Scope

Phase 1 includes:

- NestJS backend foundation.
- PostgreSQL and Redis integration.
- configuration validation.
- structured logging and correlation id.
- health checks.
- standard error response.
- request validation.
- authentication, session, refresh, logout, password reset.
- RBAC, permission guard, property scope, resident self-scope, technician assignment scope.
- property profile and settings.
- property_owner assignment and read-only property owner portal.
- rooms, room types, facilities, room status, and availability.
- manual Penghuni creation and profile management.
- active occupancy and occupancy history.
- lease, lease extension request, check-in, and check-out workflow.
- deposit charge, deduction, refund, and settlement.
- invoice, manual payment proof, manual verification, overdue tracking, and late fee assessment.
- complaint and maintenance work order.
- local file storage adapter, file metadata, private file access, and file audit.
- notification, announcement, kost rules, and FAQ.
- generic audit, auth audit, file audit, Smart Lock audit, CCTV audit, and export boundaries.
- reporting for occupancy, revenue, billing aging, payments, complaints, maintenance, Smart Lock, and CCTV.
- outbox and queue foundation for cross-context workflows.
- Smart Lock device metadata, access grants, audited commands, status sync, alerts, rate limits, and human-approved restrictions.
- CCTV camera metadata, preview sessions, snapshot request, access logs, alerts, and gateway boundary.

Phase 1 explicitly excludes:

- public booking.
- payment gateway.
- direct frontend access to Tuya.
- direct frontend access to raw CCTV stream URL.
- full debt-based Smart Lock restriction without human approval.
- property_owner mutation access.
- property_owner Smart Lock, CCTV, Settings, or Billing Management access.
- advanced Smart Lock telemetry archive.
- advanced CCTV stream health analytics.
- chat provider integration.
- push/WhatsApp provider delivery.
- generated contract/legal signing workflow.

# Phase 2 Backend Scope

Phase 2 candidates:

- Public booking, booking fee payment, booking expiry, and public intake workflow.
- Payment gateway integration, callback handling, reconciliation, and automated payment status updates.
- Advanced billing such as utility meter reading, invoice document generation, and recurring schedule tuning.
- Advanced Smart Lock async vendor command queue, telemetry history, provider token lifecycle, and richer failed-attempt windows.
- Advanced CCTV gateway management, motion events, saved snapshot archive, and stream health analytics.
- Full chat between Penghuni and admin.
- PWA push notification, email, WhatsApp, and provider retry tracking.
- Advanced reporting snapshots, scheduled exports, and heavier analytics read models.
- Contract/legal document generation and digital signature.
- Preventive maintenance schedule, vendor management, and asset maintenance history.
- Multi-property operational UX expansion after core backend scoping is proven.

Phase 2 must preserve Phase 1 security decisions:

- Provider secrets remain backend-only.
- Property scoping remains mandatory.
- property_owner remains read-only unless a future architecture decision explicitly introduces new audited permissions.
- Payment gateway callbacks are idempotent and auditable.
- Public booking does not expose internal room/security/provider data.
- Smart Lock and CCTV remain security-sensitive bounded contexts.
