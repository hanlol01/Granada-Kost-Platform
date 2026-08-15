import type { RoleCode } from "@granada-kost/domain";

type PostLoginRouteInput = {
  requestedRoute?: string;
  roles: readonly RoleCode[];
};

export function resolvePostLoginRoute({ requestedRoute, roles }: PostLoginRouteInput): string {
  if (roles.includes("property_owner")) return "/property-owners";
  return requestedRoute ?? "/";
}
