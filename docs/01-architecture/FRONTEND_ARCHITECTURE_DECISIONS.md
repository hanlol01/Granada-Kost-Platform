# Frontend Architecture Decisions (ADR)

> Status: Frozen at M11AF (2026-06-30).
> Scope: Apps `apps/admin` and `apps/penghuni`.
> Format: Lightweight ADR. Each decision is short and binding for implementation milestones M11B and beyond.
> Any change after freeze requires a new ADR entry below the relevant section, not an in-place edit.

---

## ADR-FE-001 — API Client Pattern

Decision:
- Single shared package `packages/api-client` wraps `fetch` for both Admin and Penghuni.
- Responsibilities: base URL from env, auth header injection, `Idempotency-Key`, `X-Correlation-Id` (generate if absent), JSON parsing, response envelope normalization, error normalization to a typed `ApiError`, single-flight refresh queue on 401, retry only for idempotent GET on network failure (exponential backoff, max 2 retries).
- No direct `fetch` call from feature code. All HTTP goes through the client.
- Provider SDKs (Tuya, CCTV) MUST NOT be imported from any frontend bundle.

Reason: Centralized cross-cutting concerns; auditable; consistent error shape per `BACKEND_ARCHITECTURE.md` Error Handling.

---

## ADR-FE-002 — React Query Pattern

Decision:
- TanStack Query 5 is the only server-state cache. No Redux/Zustand for server data.
- Query keys are arrays following: `[domain, resource, scope?, filters?]`, example `['billing','invoices',{propertyId},{status:'unpaid',page:1}]`.
- Default `staleTime`: 30s for operational lists, 60s for dashboards, 5min for master data (room-types, complaint-categories, kost-rules, faqs).
- Default `gcTime`: 5 minutes.
- `retry`: 1 for queries, 0 for mutations (idempotency handled via header).
- Mutations invalidate by `domain` prefix. Optimistic update allowed only for: notification mark-as-read, complaint status (Admin), payment proof verdict.
- Each domain owns a `hooks/use<Domain>.ts` file (e.g. `useRooms.ts`, `useBilling.ts`). No ad-hoc `useQuery` inside route components.

Reason: Predictable invalidation; testable; aligned with Phase 1 read-heavy workloads.

---

## ADR-FE-003 — Authentication Pattern

Decision:
- Access token: in-memory only (React state inside an `AuthProvider`). Never `localStorage`, never `sessionStorage`.
- Refresh token: HTTP-only, `Secure`, `SameSite=Lax` cookie issued by backend on login. Frontend never reads the refresh token.
- Refresh flow: API client intercepts 401, calls `POST /api/v1/auth/refresh`, retries the original request once. Concurrent 401s share one in-flight refresh promise.
- On refresh failure or `logout`: clear access token, `queryClient.clear()`, hard-redirect to `/login`.
- `auth/me` is fetched once per session and on demand via `useAuth()`; result is the source of truth for roles, permissions, `property_ids`, and `resident_id`.
- No silent re-login. No long-lived sessions in storage.

Reason: Mitigates XSS exfiltration; matches `BACKEND_ARCHITECTURE.md` Authentication and Session strategy.

---

## ADR-FE-004 — Route Guard Pattern

Decision:
- Use TanStack Router `beforeLoad` for guards. Two guards are standardized:
  - `AuthGuard` — requires authenticated session; redirects to `/login?next=<path>` otherwise.
  - `RoleGuard({ roles, permissions })` — composes on top of `AuthGuard`; redirects to `/403` if denied.
- Admin: applied at `__root.tsx` route (excluding `/login`, `/password/forgot`, `/password/reset`).
- Penghuni: applied at `_app.tsx` layout route. The bare `/login` and password reset routes remain public.
- Guards are UX-only. Backend remains the final authority for every mutation and sensitive read.
- Property Owner role logging into Admin is redirected to a read-only route group (`/property-owner/...`) to be designed at M11E.

Reason: Centralized denial path; predictable navigation; no leak of restricted UI shells.

---

## ADR-FE-005 — Property Context Pattern

Decision:
- `PropertyProvider` exposes `currentPropertyId`, `availableProperties`, and `setCurrentPropertyId`.
- Source of truth at login: `auth.me.property_ids[]`. Default selection: first property from the list.
- Persistence of selection: `sessionStorage` only (per-tab). Not persisted across browser sessions.
- Every Admin query that is property-scoped MUST include `propertyId` in the query key and as `property_id` request param.
- Penghuni does NOT use property switcher. Property is derived server-side from the resident identity.
- Switching property triggers `queryClient.removeQueries({ predicate: q => q.queryKey.includes(prevPropertyId) })` to prevent cross-property cache bleed.

Reason: Prevents property scope leaks; explicit in cache keys; matches backend Property Scope Guard.

---

## ADR-FE-006 — Feature Flag Strategy

Decision:
- Frontend flags are build-time `import.meta.env.VITE_FEATURE_*` booleans validated by `zod` at app bootstrap. Invalid env → app refuses to start in dev, falls back to safe defaults in prod with a warning.
- Frozen flag set for Phase 1:
  - `VITE_FEATURE_SMARTLOCK_MODE` = `simulated` | `live` (default `simulated` until M11G).
  - `VITE_FEATURE_CCTV_ENABLED` = `false` until M11H.
  - `VITE_FEATURE_BOOKING_ENABLED` = `false` until Phase 2.
  - `VITE_FEATURE_CHAT_ENABLED` = `false` until Phase 2.
  - `VITE_FEATURE_PUSH_ENABLED` = `false` until Phase 2.
- Server-side feature gating remains authoritative. Frontend flag merely hides UI; it does not unlock capability.
- No runtime remote flag service in Phase 1.

Reason: Lets us ship UI now while backend integrations land later, without redesigning routes.

---

## ADR-FE-007 — Shared UI Component Strategy

Decision:
- shadcn/ui components live independently in each app (`apps/admin/src/components/ui` and `apps/penghuni/src/components/ui`). They are NOT centralized in Phase 1.
- Reason: Admin and Penghuni have divergent design tokens (desktop dense vs mobile-first PWA). Premature deduplication would force compromise.
- Cross-app reuse is restricted to non-visual code via `packages/*`:
  - `packages/api-client` (HTTP + auth).
  - `packages/domain` (types, enums, error codes, money helpers, date helpers).
- A future `packages/ui-kit` MAY be introduced in Phase 2, only after both apps have stabilized.
- Lovable-generated layouts and visuals are preserved verbatim. Adjustments are limited to: adding skeletons, adding empty/error states, wiring data, and adding RBAC visibility.

Reason: Keep velocity high in M11B–M11F without premature abstraction.

---

## ADR-FE-008 — Error Handling Pattern

Decision:
- API client normalizes every error to `ApiError { code, message, details?, status, correlationId }`.
- UI taxonomy:
  - 401 → handled silently by refresh interceptor; user sees nothing or is redirected to `/login`.
  - 403 → render shared `<ForbiddenState />` inside the page shell.
  - 404 (incl. hidden cross-scope) → render `<EmptyState reason="not_found" />`. Do not reveal existence.
  - 409 / 422 → inline form errors using `error.details`; toast summary.
  - 429 → `sonner` toast with retry-after countdown; mutation buttons stay disabled until window passes.
  - 5xx / 502 / 503 → root `ErrorComponent` already in `__root.tsx`. Show `correlationId` for support.
- Every list page exposes the four states: `loading`, `empty`, `filtered-empty`, `error`.
- Mutations: always toast outcome, always invalidate by domain, always disable button while pending.
- Logging: no PII, no tokens, no provider payloads in `console`. Errors reported with `correlationId` only.

Reason: Consistent UX and audit alignment with backend Error Response Standard.

---

## ADR-FE-009 — File Upload Pattern (added at M11AF)

Decision:
- All uploads (KTP, payment proof, complaint photo, check-out photos) go through the backend File API (`POST /api/v1/files` → `POST /api/v1/files/{id}/access-url`).
- Client-side validation: MIME allowlist (`image/jpeg`, `image/png`, `application/pdf`), max 5 MB for images, 10 MB for PDFs. Server re-validates and is authoritative.
- Upload uses `multipart/form-data`. No direct-to-S3 from frontend in Phase 1.
- Preview private file content only via signed/short-lived URL returned by backend. Never cache the URL beyond its TTL.
- Sensitive file metadata (KTP number, full filename) is masked in lists.

Reason: Closes a gap noted during freeze review; aligns with `File API` and `File Storage Strategy` in backend architecture.

---

## ADR-FE-010 — Smart Lock Simulated Strategy (added at M11AF)

Decision:
- Until M10G ships real Tuya runtime, Admin Smart Lock UI calls the same backend endpoints; backend returns simulated gateway results.
- UI displays a clearly visible `Simulated` badge whenever `VITE_FEATURE_SMARTLOCK_MODE=simulated`.
- Penghuni Smart Lock UI is NOT built in M11B–M11F. It is added in M11G alongside live Tuya.
- No frontend-side polling for device telemetry in Phase 1. Status sync stays a backend job; UI reads via `GET /api/v1/smart-locks/devices` on demand and after explicit `sync-status` action.

Reason: Avoids redesign at cut-over; keeps a deterministic toggle path from simulated to live.

---

## ADR-FE-011 — Observability on Frontend (added at M11AF)

Decision:
- Every outbound request carries `X-Correlation-Id` generated client-side if not set; reused for retries within the same logical operation.
- Errors surfaced to user always show the `correlationId` in a small footer of the error state for support handoff.
- No third-party error tracker (Sentry, etc.) wired in Phase 1. A spike to evaluate is deferred to Phase 2 hardening.
- `console.error` is permitted only with normalized `ApiError`; never log raw response, headers, or tokens.

Reason: Backend already standardizes correlation id; surfacing it on the UI closes the audit loop without a vendor dependency.

---

## Change Log of ADRs

- 2026-06-30 — Initial freeze at M11AF. ADR-FE-001 through ADR-FE-011 ratified.

Seluruh implementasi WAJIB mengikuti keputusan ADR yang telah dibekukan.

Apabila menemukan inkonsistensi kecil pada implementasi M11B, lakukan perbaikan seminimal mungkin tanpa mengubah keputusan arsitektur.

Jangan membuat ADR baru kecuali benar-benar terdapat blocker arsitektur.

Output:

- ringkasan implementasi
- endpoint backend yang digunakan
- halaman yang berhasil terintegrasi
- file baru
- file berubah
- build
- lint
- typecheck
- risiko tersisa
- verdict M11C