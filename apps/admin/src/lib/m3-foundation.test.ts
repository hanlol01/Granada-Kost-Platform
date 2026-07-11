import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_UX_V2_ACCEPT, createAdminUxV2Requester } from "./admin-ux-api";
import { mapSnakeToCamel } from "./admin-ux-mapper";
import {
  getRouteAccessDecision,
  getRouteBreadcrumbs,
  adminRouteRegistry,
} from "./admin-route-registry";
import {
  adminUxQueryKeys,
  invalidationKeysFor,
  normalizePagination,
  normalizeQueryFilters,
} from "./admin-ux-query-keys";
import {
  normalizeLegacyGalleryRedirectSearch,
  parkingRedirectSearch,
} from "./admin-route-redirects";

test("M3 mapper changes snake_case and drops identity/file locations", () => {
  const mapped = mapSnakeToCamel<{
    propertyId: string;
    activeLease: { leaseCode: string };
    ktpNumber?: string;
    storagePath?: string;
  }>({
    property_id: "property-a",
    active_lease: { lease_code: "SEWA-001" },
    ktp_number: "1234567890123456",
    storage_path: "/private/identity.pdf",
  });

  assert.deepEqual(mapped, {
    propertyId: "property-a",
    activeLease: { leaseCode: "SEWA-001" },
  });
});

test("M3 requester sends V2 Accept only through its isolated requester", async () => {
  let accept = "";
  const requester = createAdminUxV2Requester({
    baseUrl: "https://api.example.test/api/v1",
    getAccessToken: () => "token",
    refreshAccessToken: async () => false,
    onAuthFailure: () => undefined,
    fetchImpl: async (_input, init) => {
      accept = new Headers(init?.headers).get("Accept") ?? "";
      return new Response(JSON.stringify({ data: { room_code: "A-01" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await requester.get<{ data: { room_code: string } }>("/rooms");
  assert.equal(accept, ADMIN_UX_V2_ACCEPT);
  assert.equal(result.data.room_code, "A-01");
});

test("M3 query keys are canonical, property-scoped, and do not retain NIK", () => {
  assert.deepEqual(
    normalizePagination({ q: "  kamar  ", offset: -2, limit: 999, tags: ["b", "a"] }),
    { limit: 100, offset: 0, q: "kamar", tags: ["a", "b"] },
  );
  assert.deepEqual(normalizeQueryFilters({ q: "1234567890123456", ktpNumber: "ignored" }), {});

  const key = adminUxQueryKeys.rooms.list("property-a", {
    q: "  A-01 ",
    offset: 0,
    limit: 20,
  });
  assert.equal(key[1], "property-a");
  assert.equal(JSON.stringify(key).includes("1234567890123456"), false);

  const invalidations = invalidationKeysFor("lease-transfer", "property-a");
  assert.equal(
    invalidations.some((keyPart) => JSON.stringify(keyPart).includes("property-a")),
    true,
  );
});

test("M3 guard honors default-off features and keeps lease labels generic", () => {
  const gallery = adminRouteRegistry.find((route) => route.id === "rooms-galeri");
  assert.ok(gallery);
  assert.equal(
    getRouteAccessDecision(gallery, {
      roles: ["admin"],
      permissions: ["room.read", "room.manage"],
      isFeatureEnabled: () => false,
    }),
    "feature-disabled",
  );
  assert.equal(
    getRouteAccessDecision(gallery, {
      roles: ["admin"],
      permissions: [],
      isFeatureEnabled: () => true,
    }),
    "forbidden",
  );

  const leaseCrumbs = getRouteBreadcrumbs("/penyewaan/6a2a5a26-381e-42d8-a7a5-2f1faa4f2f36", {
    roles: ["admin"],
    permissions: ["lease.read"],
    isFeatureEnabled: () => true,
  });
  assert.equal(leaseCrumbs.at(-1)?.label, "Detail Penyewaan");
  assert.equal(JSON.stringify(leaseCrumbs).includes("6a2a5a26-381e-42d8-a7a5-2f1faa4f2f36"), false);
});

test("M3 redirects retain only supported gallery pagination and parking tab", () => {
  assert.deepEqual(
    normalizeLegacyGalleryRedirectSearch({
      category: "apartkost",
      offset: "4",
      limit: "200",
      gender: "male",
      building: "ignore",
    }),
    { target: "apart-kost", offset: 4, limit: 100 },
  );
  assert.deepEqual(
    normalizeLegacyGalleryRedirectSearch({ category: "anything", offset: -1, limit: 0 }),
    { target: "rumah-kost", offset: 0, limit: 1 },
  );
  assert.deepEqual(parkingRedirectSearch, { tab: "parking" });
});
