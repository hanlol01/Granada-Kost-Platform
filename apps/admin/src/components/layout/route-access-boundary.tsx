import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { FeatureDisabledState, ForbiddenState, LoadingState } from "@/components/state";
import {
  findRouteMetadata,
  getRouteAccessDecision,
  type RouteAccessContext,
} from "@/lib/admin-route-registry";
import { useAuth } from "@/lib/auth";
import { useProperty } from "@/lib/property";

type Props = {
  children: ReactNode;
};

/**
 * UI boundary only. It prevents descendants and their queries from mounting
 * before authentication, property scope, feature state, and read capability are
 * resolved; backend authorization remains authoritative for every request.
 */
export function RouteAccessBoundary({ children }: Props) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { status, user } = useAuth();
  const { currentPropertyId, availableProperties } = useProperty();
  const route = findRouteMetadata(pathname);

  if (status === "loading") return <LoadingState label="Memuat akses..." />;
  if (status === "unauthenticated") return null;

  if (availableProperties.length === 0) {
    return (
      <ForbiddenState
        title="Properti belum tersedia"
        description="Akun ini belum memiliki cakupan properti untuk menampilkan data administrasi."
      />
    );
  }

  if (!currentPropertyId) return <LoadingState label="Menyiapkan properti..." />;

  if (!route) return <>{children}</>;

  const context: RouteAccessContext = {
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
  };
  const decision = getRouteAccessDecision(route, context);

  if (decision === "feature-disabled") return <FeatureDisabledState />;
  if (decision === "forbidden") return <ForbiddenState />;

  // A scope key forces descendants to remount before a new property can render.
  return <div key={currentPropertyId}>{children}</div>;
}
