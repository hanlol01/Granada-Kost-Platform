// Idempotency-Key generator. Mirrors apps/admin/src/lib/idempotency.ts so both
// frontends share the same convention with the backend (API_PLANNING.md
// > Idempotency Strategy). One key per submission; a fresh key is generated
// when the user explicitly resubmits.

export function newIdempotencyKey(): string {
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `fe-${cryptoObj.randomUUID()}`;
  }
  return `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
