import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { LoadingState } from "@/components/state/LoadingState";
import { ForbiddenState } from "@/components/state/ForbiddenState";
import { useAuth } from "./useAuth";
import type { RoleCode } from "@granada-kost/domain";

type Props = {
  children: ReactNode;
  roles?: RoleCode[];
  permissions?: string[];
};

export function AuthGuard({ children, roles, permissions }: Props) {
  const { status, hasRole, hasPermission } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (status === "unauthenticated") {
      void navigate({ to: "/login", search: { next: pathname } });
    }
  }, [status, navigate, pathname]);

  if (status === "loading") return <LoadingState label="Memuat sesi..." />;
  if (status === "unauthenticated") return null;

  if (roles && roles.length > 0 && !hasRole(roles)) {
    return <ForbiddenState />;
  }
  if (permissions && permissions.length > 0 && !hasPermission(permissions)) {
    return <ForbiddenState />;
  }
  return <>{children}</>;
}
