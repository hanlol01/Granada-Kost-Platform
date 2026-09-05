// Singleton ApiClient for the Admin app. Wired with the auth TokenProvider exposed
// by the AuthProvider (see lib/auth/AuthProvider.tsx). Per ADR-FE-001 / ADR-FE-003.
import { ApiClient, type TokenProvider } from "@granada-kost/api-client";
import { env } from "./env";

let tokenProviderRef: TokenProvider | null = null;
let accessTokenRefresh: Promise<boolean> | null = null;

export function registerTokenProvider(provider: TokenProvider): void {
  tokenProviderRef = provider;
}

const proxyTokenProvider: TokenProvider = {
  getAccessToken: () => tokenProviderRef?.getAccessToken() ?? null,
  setAccessToken: (token) => tokenProviderRef?.setAccessToken(token),
  refresh: async () => (tokenProviderRef ? tokenProviderRef.refresh() : false),
  onAuthFailure: () => tokenProviderRef?.onAuthFailure?.(),
};

export const apiClient = new ApiClient({
  baseUrl: env.VITE_API_BASE_URL,
  tokenProvider: proxyTokenProvider,
  onError: (err) => {
    // Only normalized ApiError lands here. Never log raw payloads (ADR-FE-008).
    if (typeof window !== "undefined") {
      console.error(
        `[api] ${err.code} ${err.status} ${err.message} cid=${err.correlationId ?? "-"}`,
      );
    }
  },
});

// Expose token getter for authorized raw fetch (e.g. binary blob download).
// Uses the same proxyTokenProvider — no second auth source (ADR-FE-003).
export function getAccessToken(): string | null {
  return proxyTokenProvider.getAccessToken();
}
// Admin UX V2 preserves its own envelopes, so it cannot use ApiClient's legacy
// success-envelope unwrapping. These helpers retain the same auth lifecycle.
export async function refreshAccessToken(): Promise<boolean> {
  if (accessTokenRefresh) return accessTokenRefresh;
  const refresh = proxyTokenProvider.refresh().finally(() => {
    if (accessTokenRefresh === refresh) accessTokenRefresh = null;
  });
  accessTokenRefresh = refresh;
  return refresh;
}

export function notifyAuthFailure(): void {
  proxyTokenProvider.onAuthFailure?.();
}
