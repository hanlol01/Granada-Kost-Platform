// Singleton ApiClient for the Penghuni app. Per ADR-FE-001 / ADR-FE-003.
import { ApiClient, type TokenProvider } from "@granada-kost/api-client";
import { env } from "./env";

let tokenProviderRef: TokenProvider | null = null;

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
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.error(
        `[api] ${err.code} ${err.status} ${err.message} cid=${err.correlationId ?? "-"}`,
      );
    }
  },
});
