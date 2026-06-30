import type { AuthMe, RoleCode } from "@granada-kost/domain";

export type AuthStatus = "loading" | "unauthenticated" | "authenticated";

export type AuthContextValue = {
  status: AuthStatus;
  user: AuthMe | null;
  hasRole: (role: RoleCode | RoleCode[]) => boolean;
  hasPermission: (permission: string | string[]) => boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};
