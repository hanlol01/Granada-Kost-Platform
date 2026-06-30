// Idempotency-Key generator. Backend honours the header for retry-safe writes
// per docs/01-architecture/API_PLANNING.md > Idempotency Strategy. The 'fe-' prefix
// keeps server logs able to distinguish frontend-issued keys from worker/job keys.
//
// Each mutation hook calls newIdempotencyKey() once per submission so that retries
// triggered by React Query (manual retry by the user) share the same key. A new
// key MUST be generated when the user explicitly resubmits the same form.

export function newIdempotencyKey(): string {
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `fe-${cryptoObj.randomUUID()}`;
  }
  return `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
