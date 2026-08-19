import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { adminRouteRegistry, getRouteAccessDecision } from "./admin-route-registry";
import { resolvePostLoginRoute } from "./auth/post-login-route";
import {
  getOwnerPortalRoute,
  isOwnerPortalRouteActive,
  ownerPortalRouteRegistry,
} from "./property-owner-route-registry";

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
  assert.match(route, /hasRole\("property_owner"\).*Navigate.*property-owners\/portal/s);
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

test("W10 Owner portal exposes only the dedicated read-only route allowlist", () => {
  assert.deepEqual(
    ownerPortalRouteRegistry.map((route) => route.id),
    [
      "dashboard",
      "assets",
      "occupancy",
      "finance",
      "issues",
      "reports",
      "notifications",
      "account",
    ],
  );
  assert.equal(
    ownerPortalRouteRegistry.every((route) => route.to.startsWith("/property-owners/portal")),
    true,
  );
  assert.equal(
    ownerPortalRouteRegistry.some((route) => route.to === "/rooms"),
    false,
  );
  assert.equal(
    ownerPortalRouteRegistry.filter((route) => route.mobilePriority !== undefined).length,
    4,
  );
});

test("W10 Owner route matching keeps asset detail inside Aset Saya", () => {
  assert.equal(getOwnerPortalRoute("assets")?.label, "Aset Saya");
  assert.equal(
    isOwnerPortalRouteActive(
      getOwnerPortalRoute("assets")!,
      "/property-owners/portal/assets/AK-05-03",
    ),
    true,
  );
  assert.equal(
    isOwnerPortalRouteActive(getOwnerPortalRoute("dashboard")!, "/property-owners/portal/assets"),
    false,
  );
});

test("W10 Owner entry redirects to the real portal route while Admin keeps its shell", () => {
  const route = source("routes/property-owners/index.tsx");

  assert.match(route, /Navigate/);
  assert.match(route, /to="\/property-owners\/portal"/);
  assert.match(route, /<AppShell\b/);
});

test("W10 shared shell keeps Admin defaults while Owner injects its own navigation", () => {
  const appShell = source("components/layout/app-shell.tsx");
  const ownerShell = source("components/property-owner-portal/OwnerPortalShell.tsx");

  assert.match(appShell, /sidebar\s*=\s*<RegistrySidebar\s*\/>/);
  assert.match(appShell, /bottomNavigation\s*=\s*<RegistryBottomNav\s*\/>/);
  assert.match(ownerShell, /ownerPortalRouteRegistry|getVisibleOwnerPortalRoutes/);
  assert.doesNotMatch(ownerShell, /adminRouteRegistry|getVisibleRoutes/);
  assert.match(ownerShell, /aria-label="Navigasi portal owner"/);
  assert.match(ownerShell, /Lainnya/);
});

test("W10 Owner page routes use URL-backed portal views", () => {
  const expectedRoutes = [
    ["routes/property-owners/portal/index.tsx", "dashboard"],
    ["routes/property-owners/portal/assets/index.tsx", "assets"],
    ["routes/property-owners/portal/occupancy.tsx", "occupancy"],
    ["routes/property-owners/portal/finance.tsx", "finance"],
    ["routes/property-owners/portal/issues.tsx", "issues"],
    ["routes/property-owners/portal/reports.tsx", "reports"],
    ["routes/property-owners/portal/notifications.tsx", "notifications"],
    ["routes/property-owners/portal/account.tsx", "account"],
  ] as const;

  for (const [path, view] of expectedRoutes) {
    assert.match(source(path), new RegExp(`view=["']${view}["']`));
  }
});

test("W10 Owner error boundaries keep recovery inside the Owner route allowlist", () => {
  const errorState = source("components/state/ErrorState.tsx");
  const portal = source("components/property-owner-portal/PropertyOwnerPortal.tsx");

  assert.match(errorState, /backTo\?: string/);
  assert.match(errorState, /backTo = \"\/\"/);
  assert.match(errorState, /Kembali ke portal Owner/);
  assert.match(portal, /backTo=\"\/property-owners\/portal\"/);
  assert.match(portal, /backTo=\"\/property-owners\/portal\/assets\"/);
  assert.match(portal, /backTo=\"\/property-owners\/portal\/occupancy\"/);
  assert.match(portal, /assetsQuery\.error/);
  assert.match(portal, /Aset Owner tidak dapat dimuat/);
});
