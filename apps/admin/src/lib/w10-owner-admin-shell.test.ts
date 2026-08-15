import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { adminRouteRegistry, getRouteAccessDecision } from "./admin-route-registry";
import { resolvePostLoginRoute } from "./auth/post-login-route";

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN_SRC = resolve(HERE, "..");

function source(path: string): string {
  return readFileSync(join(ADMIN_SRC, path), "utf8");
}

test("W10 Admin Owner Property renders inside the canonical Admin shell", () => {
  const workspace = source("components/property-owners/PropertyOwnerWorkspace.tsx");
  const route = source("routes/property-owners/index.tsx");

  assert.match(route, /import\s+\{\s*AppShell\s*\}/);
  assert.match(route, /<AppShell\b/);
  assert.match(route, /hasRole\("property_owner"\).*PropertyOwnerPortal/s);
  assert.doesNotMatch(workspace, /<main\b/);
});

test("W10 login delegates authenticated landing to role-aware policy", () => {
  const loginRoute = source("routes/login.tsx");

  assert.match(loginRoute, /resolvePostLoginRoute/);
  assert.match(loginRoute, /roles:\s*user\?\.roles\s*\?\?\s*\[\]/);
  assert.equal(resolvePostLoginRoute({ roles: ["admin"] }), "/");
  assert.equal(resolvePostLoginRoute({ roles: ["property_owner"] }), "/property-owners");
  assert.equal(
    resolvePostLoginRoute({ roles: ["property_owner"], requestedRoute: "/" }),
    "/property-owners",
  );
  assert.equal(resolvePostLoginRoute({ roles: ["admin"], requestedRoute: "/rooms" }), "/rooms");
});

test("W10 Admin dashboard landing is not feature-gated for an authorized Admin", () => {
  const dashboard = adminRouteRegistry.find((route) => route.id === "dashboard");

  assert.ok(dashboard);
  assert.equal(dashboard.access.feature, undefined);
  assert.equal(
    getRouteAccessDecision(dashboard, {
      roles: ["admin"],
      permissions: ["room.read", "lease.read", "billing.read"],
    }),
    "allowed",
  );
});
