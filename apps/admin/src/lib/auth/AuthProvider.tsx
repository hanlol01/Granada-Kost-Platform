import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { AuthMe, LoginRequest, LoginResponse, RoleCode } from "@granada-kost/domain";
import { ApiError } from "@granada-kost/api-client";
import { apiClient, registerTokenProvider } from "@/lib/api";
import type { AuthContextValue, AuthStatus } from "./types";

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthMe | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const accessTokenRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();

  // Register the TokenProvider exactly once. We use refs so the client can read the
  // latest token without re-instantiating the singleton (ADR-FE-001).
  useEffect(() => {
    registerTokenProvider({
      getAccessToken: () => accessTokenRef.current,
      setAccessToken: (token) => {
        accessTokenRef.current = token;
      },
      refresh: async () => {
        try {
          const res = await apiClient.post<LoginResponse>("/auth/refresh", undefined, {
            anonymous: true,
          });
          accessTokenRef.current = res.access_token;
          return true;
        } catch {
          accessTokenRef.current = null;
          return false;
        }
      },
      onAuthFailure: () => {
        accessTokenRef.current = null;
        setUser(null);
        setStatus("unauthenticated");
        queryClient.clear();
        if (router.state.location.pathname !== "/login") {
          void navigate({ to: "/login", search: { next: router.state.location.pathname } });
        }
      },
    });
  }, [queryClient, router, navigate]);

  // Boot: try silent refresh (cookie-based). If successful, fetch /auth/me.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const refreshed = await apiClient.post<LoginResponse>("/auth/refresh", undefined, {
          anonymous: true,
        });
        if (cancelled) return;
        accessTokenRef.current = refreshed.access_token;
        const me = await apiClient.get<AuthMe>("/auth/me");
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      } catch {
        if (cancelled) return;
        accessTokenRef.current = null;
        setUser(null);
        setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const body: LoginRequest = { identifier, password };
      const res = await apiClient.post<LoginResponse>("/auth/login", body, { anonymous: true });
      accessTokenRef.current = res.access_token;
      const me = await apiClient.get<AuthMe>("/auth/me");
      setUser(me);
      setStatus("authenticated");
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch (err) {
      // Swallow logout errors; we always clear local state.
      if (!ApiError.isApiError(err)) throw err;
    } finally {
      accessTokenRef.current = null;
      setUser(null);
      setStatus("unauthenticated");
      queryClient.clear();
    }
  }, [queryClient]);

  const refreshMe = useCallback(async () => {
    const me = await apiClient.get<AuthMe>("/auth/me");
    setUser(me);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const roles = user?.roles ?? [];
    const permissions = user?.permissions ?? [];
    const hasRole = (role: RoleCode | RoleCode[]) => {
      const list = Array.isArray(role) ? role : [role];
      return list.some((r) => roles.includes(r));
    };
    const hasPermission = (permission: string | string[]) => {
      const list = Array.isArray(permission) ? permission : [permission];
      return list.some((p) => permissions.includes(p));
    };
    return { status, user, hasRole, hasPermission, login, logout, refreshMe };
  }, [status, user, login, logout, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
